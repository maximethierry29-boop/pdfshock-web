import { mountGame } from "./game.js";
import { leaderboard, track } from "./api.js";

track("visit");

const $ = (id) => document.getElementById(id);
// Unités décimales, comme le Finder et le plugin.
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

let worker;
let downloadUrl;
// Comme dans le plugin : le rappel café n'apparaît qu'une fois par visite, après un export réussi.
let coffeeNudgeShown = false;
// Fichier choisi mais pas encore compressé : on laisse le temps de régler le preset avant « Zap it ».
let selected;

// Phrases du sorcier pendant les compressions longues : la première après quelques secondes,
// puis une nouvelle régulièrement. Même ton que le plugin (store/wizard-lines.md).
const WAIT_LINES = [
  "The wizard is charging his staff.",
  "Big file. The wizard asked for a second coffee.",
  "Squeezing megabytes through a very small portal.",
  "Still zapping. Heavy decks take longer to tame.",
  "He counts every image by hand. He insists.",
  "Recharging the lightning between two bolts.",
  "Your attachment limit is about to be very impressed.",
  "Nothing leaves your computer. The wizard works from home.",
  "Some of these images have been very heavy for centuries.",
  "Bored? Jump over a few PDFs below.",
];
let waitTimer;
function startWaitLines() {
  stopWaitLines();
  let i = Math.floor(Math.random() * WAIT_LINES.length);
  const next = () => {
    $("wizardLine").textContent = WAIT_LINES[i++ % WAIT_LINES.length];
    $("wizardLine").classList.remove("off");
  };
  waitTimer = setTimeout(function tick() {
    next();
    waitTimer = setTimeout(tick, 6000);
  }, 5000);
}
function stopWaitLines() {
  clearTimeout(waitTimer);
  $("wizardLine").classList.add("off"); // masquée sans libérer sa ligne : rien ne bouge
}

// Mini-jeu : visible dès la première compression, il reste jouable une fois le fichier prêt.
const game = mountGame({
  canvas: $("gameCanvas"),
  caption: $("gameCaption"),
  panel: $("game"),
  leaderboard,
  onStart: () => track("game"),
});

// Une seule zone pour progression, résultat et erreur (superposés en CSS). Une fois le jeu affiché,
// progression et résultat gardent leur place même masqués (« ghost ») : la zone a toujours la
// hauteur du résultat, et le jeu en dessous ne bouge pas pendant une partie.
function show(panel) {
  $("statusArea").hidden = !panel;
  const reserve = !$("game").hidden;
  for (const id of ["progress", "result", "error"]) {
    const keep = reserve && id !== "error";
    $(id).hidden = id !== panel && !keep;
    $(id).classList.toggle("ghost", id !== panel && keep);
  }
}

// Contenu type du résultat avant la première compression : il donne à la zone sa hauteur finale.
function placeholderResult() {
  if ($("verdict").textContent) return;
  $("verdict").textContent = "Zapped to 0.0 MB. The wizard approves.";
  $("before").textContent = "000.0 MB";
  $("after").textContent = "→ 00.0 MB";
  $("gain").textContent = "−00%";
  $("meta").textContent = "0 of 0 images recompressed · 0.0 s";
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
  $("game").hidden = false;
  placeholderResult();
  // Le lien café n'apparaît qu'au premier résultat : on le prévoit dès maintenant pour que la
  // hauteur réservée corresponde au résultat final.
  $("coffeeNudge").hidden = coffeeNudgeShown;
  show("progress");
  startWaitLines();
  game.focus(); // Espace fait sauter le sorcier au lieu de relancer « Zap it »
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
      stopWaitLines();
      $("zap").disabled = false;
      done(file, data, preset);
    } else {
      stopWaitLines();
      $("zap").disabled = false;
      show("error");
      $("error").textContent = `The spell fizzled: ${data.message}`;
    }
  };
  worker.onerror = (e) => {
    stopWaitLines();
    $("zap").disabled = false;
    show("error");
    $("error").textContent = `The spell fizzled: ${e.message || "this PDF is probably too big for your browser's memory"}.`;
  };
  const buffer = await file.arrayBuffer();
  worker.postMessage({ buffer, preset }, [buffer]);
}

function done(file, { output, stats, ms }, preset) {
  // Si rien n'a été gagné, on rend l'original plutôt qu'un fichier plus lourd.
  const kept = output.length >= file.size;
  const blob = kept ? file : new Blob([output], { type: "application/pdf" });
  track("compress", { bytesIn: file.size, bytesOut: blob.size, preset });
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(blob);

  $("before").textContent = mb(file.size);
  $("after").textContent = `→ ${mb(blob.size)}`;
  // Plafonné à 99 : un gain de 99,6 % arrondi à « −100% » laisserait croire à un fichier vide.
  const gain = Math.min(99, Math.round((1 - blob.size / file.size) * 100));
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
