// Récap hebdomadaire des stats PDFShock, envoyé par e-mail (Resend).
// Lancé par cron sur le Pi le lundi matin, dans le conteneur : docker compose exec -T api node weekly-report.mjs
// Lit directement DATA_DIR/db.json : pas de passage par /stats ni par Cloudflare Access.
// Semaine = les 7 jours complets avant aujourd'hui (lundi → dimanche), comparés aux 7 jours d'avant.
//
// Variables (.env du Pi, jamais commité) : RESEND_API_KEY, REPORT_TO, REPORT_FROM (facultatif).
// --dry-run : affiche le texte du mail sans rien envoyer.
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "./data";
const DRY = process.argv.includes("--dry-run");
const FROM = process.env.REPORT_FROM || "PDFShock <stats@pdfshock.com>";
const TO = process.env.REPORT_TO || "";
const KEY = process.env.RESEND_API_KEY || "";

const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "db.json"), "utf8"));
const days = db.days || {};

// Jours au fuseau de Paris, comme le serveur (AAAA-MM-JJ)
const parisDay = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
const shift = (n) => parisDay(new Date(Date.now() - n * 86400_000));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => shift(from + i)).reverse();
const week = range(1, 7); // hier … il y a 7 jours
const prev = range(8, 14);

const sum = (list, field) => list.reduce((n, d) => n + (days[d]?.[field] || 0), 0);
const FIELDS = ["visits", "compressions", "bytesIn", "bytesOut", "games", "scoresSaved", "preset_HIGH", "preset_BALANCED", "preset_SMALL"];
const tally = (list) => Object.fromEntries(FIELDS.map((f) => [f, sum(list, f)]));
const cur = tally(week), old = tally(prev);

const nf = (n, digits = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
const mb = (x) => (x.bytesIn - x.bytesOut) / 1e6;
const delta = (a, b) => {
  if (a === b) return "=";
  if (!b) return "nouveau";
  const p = Math.round(((a - b) / b) * 100);
  return (p > 0 ? "+" : "") + p + " %";
};

const rows = [
  ["Visites", cur.visits, old.visits],
  ["Fichiers compressés", cur.compressions, old.compressions],
  ["Mo gagnés", mb(cur), mb(old), 1],
  ["Preset High", cur.preset_HIGH, old.preset_HIGH],
  ["Preset Balanced", cur.preset_BALANCED, old.preset_BALANCED],
  ["Preset Small", cur.preset_SMALL, old.preset_SMALL],
  ["Parties jouées", cur.games, old.games],
  ["Scores enregistrés", cur.scoresSaved, old.scoresSaved],
];
const newScores = (db.scores || []).filter((s) => s.date >= week[0] && s.date <= week[6]);

const fr = (d) => d.split("-").reverse().slice(0, 2).join("/");
const period = `du ${fr(week[0])} au ${fr(week[6])}`;
const subject = `PDFShock, semaine ${period} : ${nf(cur.visits)} visites, ${nf(cur.compressions)} fichiers`;

const text = [
  `Stats pdfshock.com ${period} (entre parenthèses : semaine précédente)`,
  "",
  ...rows.map(([label, a, b, dg = 0]) => `${label} : ${nf(a, dg)} (${nf(b, dg)}, ${delta(Math.round(a * 10), Math.round(b * 10))})`),
  "",
  "Hall of zappers, nouveaux scores dans le top 10 :",
  ...(newScores.length ? newScores.map((s) => `  ${s.name}, ${s.score} MB, le ${fr(s.date)}`) : ["  aucun"]),
  "",
  "Détail : https://api.pdfshock.com/stats",
].join("\n");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const td = "padding:6px 10px;border-bottom:1px solid #202c52;text-align:right";
const html = `<div style="background:#0a0e1c;color:#e7ecfb;font:15px/1.5 -apple-system,system-ui,sans-serif;padding:24px">
<h1 style="font-size:20px;margin:0 0 4px">⚡ PDFShock, semaine ${period}</h1>
<p style="color:#93a0c9;margin:0 0 16px">Comparée aux 7 jours précédents</p>
<table style="border-collapse:collapse;font-variant-numeric:tabular-nums">
<tr><th style="${td};text-align:left;color:#93a0c9;font-weight:500"></th><th style="${td};color:#93a0c9;font-weight:500">Semaine</th><th style="${td};color:#93a0c9;font-weight:500">Précédente</th><th style="${td};color:#93a0c9;font-weight:500">Écart</th></tr>
${rows.map(([label, a, b, dg = 0]) => `<tr><td style="${td};text-align:left">${label}</td><td style="${td}"><b>${nf(a, dg)}</b></td><td style="${td}">${nf(b, dg)}</td><td style="${td}">${delta(Math.round(a * 10), Math.round(b * 10))}</td></tr>`).join("")}
</table>
<h2 style="font-size:16px;margin:24px 0 8px">Hall of zappers</h2>
<p style="margin:0">${newScores.length ? newScores.map((s) => `${esc(s.name)}, ${s.score} MB, le ${fr(s.date)}`).join("<br>") : "Aucun nouveau score dans le top 10."}</p>
<p style="margin:24px 0 0"><a style="color:#7aa2ff" href="https://api.pdfshock.com/stats">Voir le détail</a></p></div>`;

if (DRY) {
  console.log(`Objet : ${subject}\n\n${text}`);
  process.exit(0);
}
if (!KEY || !TO) {
  console.error("RESEND_API_KEY ou REPORT_TO manquant dans .env");
  process.exit(1);
}
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: FROM, to: TO.split(","), subject, text, html }),
});
if (!res.ok) {
  console.error(`Envoi refusé : ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`${new Date().toISOString()} récap envoyé (${period})`);
