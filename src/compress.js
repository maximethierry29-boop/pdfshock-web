// Compression d'un PDF existant avec MuPDF : les images sont réduites puis réencodées en JPEG,
// le texte et les vecteurs restent intacts (contrairement au plugin, rien n'est aplati).
import * as mupdf from "mupdf";

// Mêmes presets que le plugin (src/messages.ts) : `scale` = px max par pt de page.
export const PRESETS = {
  HIGH: { scale: 2, jpegQuality: 85 },
  BALANCED: { scale: 1.5, jpegQuality: 72 },
  SMALL: { scale: 1, jpegQuality: 55 },
};

// Une image plus petite que ce seuil ne vaut pas le coût d'un réencodage.
const MIN_IMAGE_BYTES = 20_000;

export function compressPdf(
  input,
  presetName = "BALANCED",
  onProgress = () => {},
) {
  const preset = PRESETS[presetName];
  const doc = mupdf.Document.openDocument(input, "application/pdf").asPDF();
  if (!doc) throw new Error("Not a PDF");

  // Plafond en px : plus grand côté de page (pt) × scale. Une image ne s'affiche jamais plus grand que la page.
  let maxPageSide = 0;
  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    const [x0, y0, x1, y1] = doc.loadPage(i).getBounds();
    maxPageSide = Math.max(maxPageSide, x1 - x0, y1 - y0);
  }
  const maxSide = Math.round(maxPageSide * preset.scale);

  // Les masques de transparence (SMask) restent sans perte : un JPEG y crée des halos sur les bords.
  const masks = new Set();
  const images = [];
  const objCount = doc.countObjects();
  for (let num = 1; num < objCount; num++) {
    const obj = doc.newIndirect(num);
    if (!obj.isStream()) continue;
    if (obj.get("Subtype").asName?.() !== "Image") continue;
    const smask = obj.get("SMask");
    if (smask.isIndirect()) masks.add(smask.asIndirect());
    images.push(num);
  }

  const stats = { images: images.length, rewritten: 0, skipped: 0, errors: 0 };
  images.forEach((num, index) => {
    onProgress({ step: "images", done: index, total: images.length });
    if (masks.has(num)) {
      stats.skipped++;
      return;
    }
    try {
      if (rewriteImage(doc, num, preset, maxSide)) stats.rewritten++;
      else stats.skipped++;
    } catch (err) {
      stats.errors++;
      console.warn(`Image ${num} ignorée :`, err.message);
    }
  });

  onProgress({ step: "saving" });
  try {
    doc.subsetFonts();
  } catch {
    /* polices non sous-ensemblables : on garde l'original */
  }
  const buf = doc.saveToBuffer(
    "garbage=deduplicate,compress=yes,compress-fonts=yes,compress-images=yes",
  );
  const out = buf.asUint8Array().slice();
  buf.destroy();
  doc.destroy();
  return { output: out, stats, maxSide };
}

function rewriteImage(doc, num, preset, maxSide) {
  const ref = doc.newIndirect(num);
  if (ref.get("ImageMask").asBoolean?.()) return false; // masque 1 bit, déjà minuscule
  const raw = ref.readRawStream();
  const original = raw.getLength();
  raw.destroy();
  if (original < MIN_IMAGE_BYTES) return false;

  // La mémoire WASM ne se libère pas seule : chaque objet MuPDF intermédiaire est détruit à la main,
  // sinon un gros deck sature le tas (≈ 2 Go) au bout de quelques images.
  const trash = [];
  try {
    return encode();
  } finally {
    for (const o of trash) o.destroy();
  }

  function encode() {
    const image = doc.loadImage(ref);
    trash.push(image);
    let pix = image.toPixmap();
    trash.push(pix);
    const w = pix.getWidth(),
      h = pix.getHeight();

    // JPEG = Gray ou RGB sans alpha ; CMYK, Indexed, Lab… passent en RGB.
    const cs = pix.getColorSpace();
    const gray = cs && cs.isGray();
    if (pix.getAlpha() || !(gray || cs?.isRGB())) {
      pix = pix.convertToColorSpace(
        gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB,
        false,
      );
      trash.push(pix);
    }

    const ratio = Math.min(1, maxSide / Math.max(w, h));
    let nw = w,
      nh = h;
    if (ratio < 1) {
      nw = Math.max(1, Math.round(w * ratio));
      nh = Math.max(1, Math.round(h * ratio));
      pix = pix.warp(
        [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ],
        nw,
        nh,
      );
      trash.push(pix);
    }

    const jpeg = pix.asJPEG(preset.jpegQuality);
    if (jpeg.length >= original) return false; // déjà mieux compressée

    ref.writeRawStream(jpeg);
    ref.put("Filter", doc.newName("DCTDecode"));
    ref.put("Width", nw);
    ref.put("Height", nh);
    ref.put("BitsPerComponent", 8);
    ref.put("ColorSpace", doc.newName(gray ? "DeviceGray" : "DeviceRGB"));
    for (const key of ["DecodeParms", "Decode", "ColorTransform"])
      ref.delete(key);
    return true;
  }
}
