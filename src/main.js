const $ = (id) => document.getElementById(id);
// Unités décimales, comme le Finder et le plugin.
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

let worker;
let downloadUrl;

function show(panel) {
  for (const id of ["progress", "result", "error"]) $(id).hidden = id !== panel;
}

async function handle(file) {
  if (!file || !/\.pdf$/i.test(file.name)) {
    show("error");
    $("error").textContent = "Please choose a PDF file.";
    return;
  }
  const preset = document.querySelector("input[name=preset]:checked").value;
  show("progress");
  $("status").textContent = `Reading ${file.name} (${mb(file.size)})…`;
  $("bar").style.width = "2%";

  // Un worker neuf par fichier : repart d'un tas WASM vide, même après un très gros PDF.
  worker?.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      if (data.step === "images") {
        $("status").textContent = `Compressing images ${data.done + 1} / ${data.total}`;
        $("bar").style.width = `${5 + (90 * data.done) / Math.max(1, data.total)}%`;
      } else {
        $("status").textContent = "Writing PDF…";
        $("bar").style.width = "96%";
      }
    } else if (data.type === "done") {
      done(file, data);
    } else {
      show("error");
      $("error").textContent = `Could not compress this PDF: ${data.message}`;
    }
  };
  worker.onerror = (e) => {
    show("error");
    $("error").textContent = `Compression failed (${e.message || "out of memory?"}).`;
  };
  const buffer = await file.arrayBuffer();
  worker.postMessage({ buffer, preset }, [buffer]);
}

function done(file, { output, stats, ms }) {
  // Si rien n'a été gagné, on rend l'original plutôt qu'un fichier plus lourd.
  const kept = output.length >= file.size;
  const blob = kept ? file : new Blob([output], { type: "application/pdf" });
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);

  $("before").textContent = mb(file.size);
  $("after").textContent = `→ ${mb(blob.size)}`;
  $("gain").textContent = kept ? "already optimized" : `−${Math.round((1 - blob.size / file.size) * 100)}%`;
  $("meta").textContent =
    `${stats.rewritten} of ${stats.images} images recompressed · ${(ms / 1000).toFixed(1)} s` +
    (stats.errors ? ` · ${stats.errors} skipped (errors)` : "");
  $("download").href = downloadUrl;
  $("download").download = file.name.replace(/\.pdf$/i, "") + "_PDFShock.pdf";
  show("result");
}

$("file").addEventListener("change", (e) => handle(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  handle(e.dataTransfer.files[0]);
});
