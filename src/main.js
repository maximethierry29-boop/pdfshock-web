const $ = (id) => document.getElementById(id);
// Unités décimales, comme le Finder et le plugin.
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

let worker;
let downloadUrl;
// Comme dans le plugin : le rappel café n'apparaît qu'une fois par visite, après un export réussi.
let coffeeNudgeShown = false;
// Fichier choisi mais pas encore compressé : on laisse le temps de régler le preset avant « Zap it ».
let selected;

function show(panel) {
  for (const id of ["progress", "result", "error"]) $(id).hidden = id !== panel;
}

function select(file) {
  if (!file || !/\.pdf$/i.test(file.name)) {
    show("error");
    $("error").textContent = "The wizard needs a target. Drop a PDF.";
    return;
  }
  selected = file;
  show(null);
  $("drop").classList.add("ready");
  $("dropTitle").textContent = file.name;
  $("dropHint").textContent = `${mb(file.size)} · click or drop to change`;
  $("zap").disabled = false;
}

async function handle(file) {
  $("zap").disabled = true;
  const preset = document.querySelector("input[name=preset]:checked").value;
  show("progress");
  $("coffeeNudge").hidden = true;
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
      } else if (data.step === "scanning") {
        $("status").textContent = "Measuring images…";
        $("bar").style.width = "4%";
      } else {
        $("status").textContent = "Writing PDF…";
        $("bar").style.width = "96%";
      }
    } else if (data.type === "done") {
      $("zap").disabled = false;
      done(file, data);
    } else {
      $("zap").disabled = false;
      show("error");
      $("error").textContent = `The spell fizzled: ${data.message}`;
    }
  };
  worker.onerror = (e) => {
    $("zap").disabled = false;
    show("error");
    $("error").textContent = `The spell fizzled: ${e.message || "this PDF is probably too big for your browser's memory"}.`;
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
  const gain = Math.round((1 - blob.size / file.size) * 100);
  $("gain").textContent = gain > 0 ? `−${gain}%` : "";
  // Phrases du sorcier, reprises du plugin (~/pdfshock/store/wizard-lines.md).
  // Moins de 5 % gagnés : le fichier était déjà léger (ex. un PDF déjà passé dans PDFShock).
  $("verdict").textContent = gain < 5
    ? "It was already light, so the wizard saved his energy."
    : `Zapped to ${mb(blob.size)}. The wizard approves.`;
  if (!coffeeNudgeShown) {
    $("coffeeNudge").hidden = false;
    coffeeNudgeShown = true;
  }
  $("meta").textContent =
    `${stats.rewritten} of ${stats.images} images recompressed · ${(ms / 1000).toFixed(1)} s` +
    (stats.errors ? ` · ${stats.errors} skipped (errors)` : "");
  $("download").href = downloadUrl;
  $("download").download = file.name.replace(/\.pdf$/i, "") + "_PDFShock.pdf";
  show("result");
}

$("file").addEventListener("change", (e) => {
  select(e.target.files[0]);
  e.target.value = ""; // permet de rechoisir le même fichier
});
$("zap").addEventListener("click", () => selected && handle(selected));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  select(e.dataTransfer.files[0]);
});
