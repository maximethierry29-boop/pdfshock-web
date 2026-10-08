// Client du petit serveur PDFShock (Raspberry Pi, via tunnel Cloudflare) : classement du jeu et
// compteurs anonymes. Aucune donnée personnelle ni contenu de fichier : seulement des totaux.
// Toute erreur est silencieuse : si le serveur est injoignable, le site fonctionne normalement.
const API = import.meta.env.VITE_API_URL || "https://pdfshock-api.maximethierry.fr";
// On ne compte que sur le site de production : ni en local, ni sur les aperçus de branche
// Cloudflare Pages (*.pdfshock-web.pages.dev), qui fausseraient les stats. Le classement reste lisible partout.
const COUNTING = ["pdfshock.com", "pdfshock-web.pages.dev", "pdfshock.netlify.app"].includes(location.hostname);

async function call(path, body) {
  try {
    const res = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      keepalive: !!body,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const leaderboard = {
  top: async () => (await call("/scores"))?.scores ?? null,
  submit: async (name, score) => (await call("/scores", { name, score }))?.scores ?? null,
};

export function track(type, data = {}) {
  if (COUNTING) call("/track", { type, ...data });
}
