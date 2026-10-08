// Serveur PDFShock (Raspberry Pi, exposé uniquement par le tunnel Cloudflare) :
// classement du mini-jeu et compteurs anonymes du site. Node seul, sans dépendance.
// Données dans un fichier JSON (DATA_DIR/db.json), écrit de façon atomique.
//
// Routes : GET /health · GET|POST /scores · POST /track · GET /stats (HTML) · GET /stats.json
// /stats exige un jeton Cloudflare Access valide (signature vérifiée), pas un simple en-tête.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 5181);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || "./data";
const DB_FILE = path.join(DATA_DIR, "db.json");
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://pdfshock.com,https://www.pdfshock.com,https://pdfshock-web.pages.dev,https://pdfshock.netlify.app,http://localhost:5174,http://localhost:5175").split(",");
const CF_TEAM = process.env.CF_TEAM || ""; // ex. broad-poetry-d106
const CF_AUD = process.env.CF_AUD || ""; // « Application Audience (AUD) Tag » de l'application Access
const TOP = 10;

// ———————— Stockage ————————
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { scores: [], totals: {}, days: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
} catch {
  /* premier démarrage */
}
let dirty = false;
function save() {
  if (!dirty) return;
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // atomique : jamais de fichier à moitié écrit
  dirty = false;
}
setInterval(save, 2000).unref();
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => (save(), process.exit(0)));

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()); // AAAA-MM-JJ
function count(field, n = 1) {
  const day = (db.days[today()] ??= {});
  db.totals[field] = (db.totals[field] || 0) + n;
  day[field] = (day[field] || 0) + n;
  dirty = true;
}

// ———————— Limites d'abus (mémoire) ————————
const hits = new Map();
function allowed(ip, bucket, max, windowMs) {
  const key = bucket + ip, now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= max;
}
setInterval(() => hits.clear(), 3600_000).unref();

// ———————— Cloudflare Access ————————
let certs = { at: 0, keys: [] };
async function accessKeys() {
  if (Date.now() - certs.at < 3600_000 && certs.keys.length) return certs.keys;
  const res = await fetch(`https://${CF_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
  const { keys } = await res.json();
  certs = { at: Date.now(), keys };
  return keys;
}
async function accessUser(req) {
  if (!CF_TEAM || !CF_AUD) return null;
  const token = req.headers["cf-access-jwt-assertion"];
  if (typeof token !== "string") return null;
  const [h, p, sig] = token.split(".");
  if (!sig) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url"));
    const payload = JSON.parse(Buffer.from(p, "base64url"));
    const jwk = (await accessKeys()).find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== "RS256") return null;
    const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(sig, "base64url"));
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!ok || !aud.includes(CF_AUD) || payload.exp * 1000 < Date.now()) return null;
    return payload.email || "access";
  } catch {
    return null;
  }
}

// ———————— HTTP ————————
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 2048) req.destroy(); // corps minuscule attendu
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}
const int = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return send(res, 204, "");
  const ip = String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress);

  if (url.pathname === "/health") return send(res, 200, { ok: true });

  if (url.pathname === "/scores" && req.method === "GET") return send(res, 200, { scores: db.scores });

  if (url.pathname === "/scores" && req.method === "POST") {
    if (!allowed(ip, "score", 10, 3600_000)) return send(res, 429, { error: "Too many scores, take a breath." });
    const body = await readJson(req);
    const name = String(body?.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const score = int(body?.score, 100_000);
    if (!name || !score) return send(res, 400, { error: "Invalid name or score." });
    db.scores.push({ name, score, date: today() });
    db.scores.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    db.scores = db.scores.slice(0, TOP);
    count("scoresSaved");
    return send(res, 200, { scores: db.scores });
  }

  if (url.pathname === "/track" && req.method === "POST") {
    if (!allowed(ip, "track", 120, 60_000)) return send(res, 429, { error: "Slow down." });
    const body = await readJson(req);
    if (body?.type === "visit") count("visits");
    else if (body?.type === "game") count("games");
    else if (body?.type === "compress") {
      const bytesIn = int(body.bytesIn, 5e9), bytesOut = int(body.bytesOut, 5e9);
      if (bytesIn === null || bytesOut === null || bytesOut > bytesIn) return send(res, 400, { error: "Invalid sizes." });
      count("compressions");
      count("bytesIn", bytesIn);
      count("bytesOut", bytesOut);
      if (["HIGH", "BALANCED", "SMALL"].includes(body.preset)) count(`preset_${body.preset}`);
    } else return send(res, 400, { error: "Unknown event." });
    return send(res, 204, "");
  }

  if (url.pathname === "/stats" || url.pathname === "/stats.json") {
    if (!CF_TEAM || !CF_AUD) return send(res, 503, { error: "Stats are not configured (CF_TEAM / CF_AUD)." });
    const user = await accessUser(req);
    if (!user) return send(res, 403, { error: "Cloudflare Access login required." });
    const data = { totals: db.totals, days: db.days, scores: db.scores };
    return url.pathname === "/stats.json" ? send(res, 200, data) : send(res, 200, statsPage(data), "text/html; charset=utf-8");
  }

  send(res, 404, { error: "Not found." });
});
server.listen(PORT, HOST, () => console.log(`PDFShock server on http://${HOST}:${PORT}`));

// ———————— Page de stats (HTML statique, sans script) ————————
function statsPage({ totals, days, scores }) {
  const t = (k) => totals[k] || 0;
  const mb = (b) => (b / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const saved = t("bytesIn") - t("bytesOut");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const rows = Object.keys(days)
    .sort()
    .reverse()
    .slice(0, 60)
    .map((d) => {
      const x = days[d], s = (x.bytesIn || 0) - (x.bytesOut || 0);
      return `<tr><td>${d}</td><td>${x.visits || 0}</td><td>${x.compressions || 0}</td><td>${mb(s)}</td><td>${x.games || 0}</td></tr>`;
    })
    .join("");
  const card = (label, value) => `<div class="card"><span>${label}</span><b>${value}</b></div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDFShock · Stats</title>
<style>body{margin:0;padding:32px 16px;background:#0a0e1c;color:#e7ecfb;font:15px/1.5 -apple-system,system-ui,sans-serif}main{max-width:820px;margin:auto}h1{font-size:26px;margin:0 0 20px}h2{font-size:17px;margin:28px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.card{background:#121a33;border:1px solid #202c52;border-radius:12px;padding:14px}.card span{display:block;color:#93a0c9;font-size:13px}.card b{font-size:24px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:6px 8px;border-bottom:1px solid #202c52}th:first-child,td:first-child{text-align:left}th{color:#93a0c9;font-weight:500}</style></head>
<body><main><h1>⚡ PDFShock · Stats</h1><div class="grid">
${card("Visites", t("visits").toLocaleString("fr-FR"))}${card("Fichiers compressés", t("compressions").toLocaleString("fr-FR"))}
${card("Mo gagnés", mb(saved))}${card("Gain moyen", t("bytesIn") ? Math.round((saved / t("bytesIn")) * 100) + " %" : "–")}
${card("Parties jouées", t("games").toLocaleString("fr-FR"))}${card("Scores enregistrés", t("scoresSaved").toLocaleString("fr-FR"))}
${card("Presets H / B / S", `${t("preset_HIGH")} / ${t("preset_BALANCED")} / ${t("preset_SMALL")}`)}</div>
<h2>Par jour (60 derniers)</h2><table><tr><th>Jour</th><th>Visites</th><th>Fichiers</th><th>Mo gagnés</th><th>Parties</th></tr>${rows || '<tr><td colspan="5">Aucune donnée.</td></tr>'}</table>
<h2>Hall of zappers</h2><table><tr><th>#</th><th>Nom</th><th>Score</th><th>Date</th></tr>${scores.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${s.score} MB</td><td>${s.date}</td></tr>`).join("") || '<tr><td colspan="4">Aucun score.</td></tr>'}</table>
</main></body></html>`;
}
