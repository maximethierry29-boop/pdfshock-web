import { defineConfig } from "vite";

// MuPDF utilise un top-level await et charge son .wasm via import.meta.url : pas de pré-bundling.
export default defineConfig({
  optimizeDeps: { exclude: ["mupdf"] },
  worker: { format: "es" },
  build: {
    target: "esnext",
    // wizard.html : habillage de test, construit à côté de la page principale.
    rollupOptions: { input: { main: "index.html", wizard: "wizard.html" } },
  },
});
