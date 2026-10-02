// Tout le traitement a lieu ici, dans le navigateur : le fichier ne quitte jamais la machine.
// MuPDF est importé dynamiquement : avec un import statique, son top-level await retarde la pose de
// onmessage et le premier message (le fichier) est perdu.
const ready = import("./compress.js");

self.onmessage = async ({ data: { buffer, preset } }) => {
  try {
    const { compressPdf } = await ready;
    const t = performance.now();
    const { output, stats } = compressPdf(new Uint8Array(buffer), preset, (p) => self.postMessage({ type: "progress", ...p }));
    self.postMessage({ type: "done", output, stats, ms: performance.now() - t }, [output.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
};
