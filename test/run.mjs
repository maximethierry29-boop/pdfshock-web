// Usage : node test/run.mjs [fichier.pdf] — sans argument, génère un deck de synthèse.
import * as mupdf from "mupdf";
import fs from "node:fs";
import { compressPdf } from "../src/compress.js";

function makeFixture() {
  const doc = new mupdf.PDFDocument();
  for (let p = 0; p < 5; p++) {
    const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 3840, 2160], false);
    const px = pix.getPixels();
    for (let i = 0; i < px.length; i += 3) {
      const x = (i / 3) % 3840, y = Math.floor(i / 3 / 3840);
      px[i] = (x / 15 + p * 40 + Math.random() * 30) & 255;
      px[i + 1] = (y / 9 + Math.random() * 30) & 255;
      px[i + 2] = ((x + y) / 23 + Math.random() * 30) & 255;
    }
    const img = doc.addImage(new mupdf.Image(pix));
    const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
    const res = doc.addObject({ XObject: { Im0: img }, Font: { F1: font } });
    const content = `q 1920 0 0 1080 0 0 cm /Im0 Do Q BT /F1 64 Tf 80 900 Td (Slide ${p + 1} - PDFShock test) Tj ET`;
    doc.insertPage(-1, doc.addPage([0, 0, 1920, 1080], 0, res, content));
  }
  return doc.saveToBuffer("compress").asUint8Array().slice();
}

const input = process.argv[2] ? fs.readFileSync(process.argv[2]) : makeFixture();
if (!process.argv[2]) fs.writeFileSync("test/fixture.pdf", input);
for (const preset of ["HIGH", "BALANCED", "SMALL"]) {
  const t = performance.now();
  const { output, stats, maxSide } = compressPdf(input, preset);
  fs.writeFileSync(`test/out-${preset}.pdf`, output);
  const mb = (n) => (n / 1e6).toFixed(2) + " Mo";
  console.log(preset.padEnd(9), mb(input.length), "→", mb(output.length), `${((performance.now() - t) / 1000).toFixed(1)} s`, `cap ${maxSide}px`, JSON.stringify(stats));
}
// Le texte doit survivre.
const check = mupdf.Document.openDocument(fs.readFileSync("test/out-SMALL.pdf"), "application/pdf");
console.log("Texte p.1 :", JSON.stringify(check.loadPage(0).toStructuredText().asText().trim()));
