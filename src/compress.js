// Compression d'un PDF existant avec MuPDF : les images trop définies sont réduites puis réencodées
// en JPEG, le texte et les vecteurs restent intacts (contrairement au plugin, rien n'est aplati).
import * as mupdf from "mupdf";
import { zlibSync } from "fflate";

// Résolution cible à la taille réelle d'affichage de chaque image (1 pt = 1/72 po).
// Repère deck Figma (1 pt = 1 px) : 72 ppi = la taille de la slide, 110 ppi ≈ 1,5×.
// High = impression, Balanced = présentation projetée ou écran Retina, Smallest = pièce jointe.
export const PRESETS = {
  HIGH: { ppi: 300, jpegQuality: 85, lossyMasks: false },
  BALANCED: { ppi: 110, jpegQuality: 80, lossyMasks: true },
  SMALL: { ppi: 72, jpegQuality: 65, lossyMasks: true },
};

// Une image plus petite que ce seuil ne vaut pas le coût d'un réencodage.
const MIN_IMAGE_BYTES = 20_000;
// Marge avant de réduire : une image à 160 ppi pour une cible de 150 n'en vaut pas la perte.
const PPI_TOLERANCE = 1.15;
// Image visible à moins de 85 % : la partie masquée est remplie (voir rewriteImage).
const BLANK_BELOW = 0.85;
// Octets par échantillon au-delà desquels un JPEG est jugé enregistré en qualité maximale.
const HEAVY_JPEG = 0.12;

export function compressPdf(
  input,
  presetName = "BALANCED",
  onProgress = () => {},
) {
  const preset = PRESETS[presetName];
  const doc = mupdf.Document.openDocument(input, "application/pdf").asPDF();
  if (!doc) throw new Error("Not a PDF");

  onProgress({ step: "scanning" });
  const displayed = measureDisplayedImages(doc);
  stripEditorData(doc);

  // Masques de transparence (SMask) : traités à part, sans perte (un JPEG crée des halos sur les
  // bords). On note la clé de l'image qu'ils détourent avant toute réécriture, pour retrouver sa
  // taille d'affichage.
  const masks = new Map();
  const images = [];
  const objCount = doc.countObjects();
  for (let num = 1; num < objCount; num++) {
    const obj = doc.newIndirect(num);
    if (!obj.isStream()) continue;
    if (obj.get("Subtype").asName?.() !== "Image") continue;
    const smask = obj.get("SMask");
    if (smask.isIndirect()) {
      const parent = doc.loadImage(obj);
      masks.set(smask.asIndirect(), imageKey(parent.getWidth(), parent.getHeight(), parent.getNumberOfComponents()));
      parent.destroy();
    }
    images.push(num);
  }

  const stats = { images: images.length, rewritten: 0, skipped: 0, errors: 0 };
  images.forEach((num, index) => {
    onProgress({ step: "images", done: index, total: images.length });
    try {
      const done = masks.has(num)
        ? rewriteMask(doc, num, preset, displayed.get(masks.get(num)))
        : rewriteImage(doc, num, preset, displayed);
      if (done) stats.rewritten++;
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
  return { output: out, stats };
}

// Pour chaque image : taille d'affichage maximale (en pt) et partie réellement visible, relevées
// en « jouant » chaque page sur un device qui ne dessine rien et suit la pile des zones de découpe.
// Le device reçoit des images décodées, pas leurs objets PDF : on les rapproche par leurs
// caractéristiques. Deux images identiques en taille cumulent leurs usages (plus grande taille,
// union des zones visibles), ce qui ne peut que limiter la compression.
const FULL = [-Infinity, -Infinity, Infinity, Infinity];
const intersect = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const bbox = (pts) => [
  Math.min(...pts.map((p) => p[0])),
  Math.min(...pts.map((p) => p[1])),
  Math.max(...pts.map((p) => p[0])),
  Math.max(...pts.map((p) => p[1])),
];
const invert = ([a, b, c, d, e, f]) => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};

function measureDisplayedImages(doc) {
  const sizes = new Map();
  const stack = [FULL];
  let tileDepth = 0;
  const pushClip = (rect) => stack.push(intersect(stack[stack.length - 1], rect));
  const unitBox = (ctm) => bbox([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)]);
  const device = new mupdf.Device({
    clipPath: (path, evenOdd, ctm) => pushClip(path.getBounds(null, ctm)),
    clipStrokePath: (path, stroke, ctm) => pushClip(path.getBounds(stroke, ctm)),
    clipText: (text, ctm) => pushClip(text.getBounds(null, ctm)),
    clipStrokeText: (text, stroke, ctm) => pushClip(text.getBounds(stroke, ctm)),
    clipImageMask: (image, ctm) => pushClip(unitBox(ctm)),
    endMask: () => pushClip(FULL), // un masque doux agit comme une découpe aux bords inconnus
    popClip: () => stack.length > 1 && stack.pop(),
    beginTile: () => (tileDepth++, 0),
    endTile: () => tileDepth--,
    fillImage(image, ctm) {
      const key = imageKey(image.getWidth(), image.getHeight(), image.getNumberOfComponents());
      const w = Math.hypot(ctm[0], ctm[1]);
      const h = Math.hypot(ctm[2], ctm[3]);
      // Partie visible, ramenée dans le carré unité de l'image (0..1, origine en haut à gauche).
      let vis = [0, 0, 1, 1];
      const clip = intersect(stack[stack.length - 1], unitBox(ctm));
      if (tileDepth === 0 && clip[2] > clip[0] && clip[3] > clip[1] && Math.abs(w * h) > 0) {
        const inv = invert(ctm);
        const u = bbox([apply(inv, clip[0], clip[1]), apply(inv, clip[2], clip[1]), apply(inv, clip[0], clip[3]), apply(inv, clip[2], clip[3])]);
        vis = [Math.max(0, u[0]), Math.max(0, u[1]), Math.min(1, u[2]), Math.min(1, u[3])];
      } else if (tileDepth === 0) {
        vis = [0, 0, 0, 0]; // entièrement hors champ à cet endroit
      }
      const prev = sizes.get(key);
      sizes.set(
        key,
        prev
          ? {
              w: Math.max(prev.w, w),
              h: Math.max(prev.h, h),
              vis: [Math.min(prev.vis[0], vis[0]), Math.min(prev.vis[1], vis[1]), Math.max(prev.vis[2], vis[2]), Math.max(prev.vis[3], vis[3])],
            }
          : { w, h, vis },
      );
    },
  });
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    page.run(device, mupdf.Matrix.identity);
    page.destroy?.();
  }
  device.close();
  return sizes;
}

const imageKey = (w, h, n) => `${w}x${h}x${n}`;

// Données d'édition des logiciels de création (Illustrator « Preserve editing capabilities »,
// Photoshop, InDesign) et vignettes de page : invisibles à l'affichage et à l'impression, elles
// peuvent peser autant que les images. Le PDF compressé ne se rouvrira plus comme un .ai modifiable.
function stripEditorData(doc) {
  doc.getTrailer().get("Root").delete("PieceInfo");
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.findPage(i);
    page.delete("PieceInfo");
    page.delete("Thumb");
  }
  for (let num = 1; num < doc.countObjects(); num++) {
    const obj = doc.newIndirect(num);
    if (obj.isDictionary() && obj.get("Subtype").asName?.() === "Form") obj.delete("PieceInfo");
  }
}

// Masque de transparence : réduit à la résolution cible de l'image qu'il détoure, puis stocké en
// Flate (sans perte). Les masques sont souvent faits d'aplats (0 ou 255) : Flate y bat largement
// le JPEG 2000 ou le JPEG, sans aucun halo. On compresse réellement avant de choisir : une
// estimation (taille du PNG, qui profite de ses filtres) sous-évalue le Flate brut.
function rewriteMask(doc, num, preset, size) {
  const ref = doc.newIndirect(num);
  const raw = ref.readRawStream();
  const original = raw.getLength();
  raw.destroy();
  if (original < MIN_IMAGE_BYTES || !size || size.w <= 0 || size.h <= 0) return false;

  const image = doc.loadImage(ref);
  const pix = image.toPixmap();
  try {
    if (pix.getNumberOfComponents() !== 1 || pix.getAlpha()) return false; // masque inattendu : on n'y touche pas
    const w = pix.getWidth(),
      h = pix.getHeight();
    const ratio = Math.min(1, Math.max(preset.ppi / (w / (size.w / 72)), preset.ppi / (h / (size.h / 72))));
    const resize = ratio < 1 / PPI_TOLERANCE;
    const nw = resize ? Math.max(1, Math.round(w * ratio)) : w,
      nh = resize ? Math.max(1, Math.round(h * ratio)) : h;
    const samples = boxDownsample(pix.getPixels(), w, h, pix.getStride(), nw, nh);
    let data = zlibSync(samples, { level: 9 }),
      filter = "FlateDecode";
    // Hors High quality, un JPEG très fin (q92) est accepté s'il divise vraiment le poids :
    // à ce niveau, l'adoucissement des bords du détourage reste invisible.
    if (preset.lossyMasks) {
      const gray = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, nw, nh], false);
      gray.getPixels().set(samples);
      const jpeg = gray.asJPEG(92, false);
      gray.destroy();
      if (jpeg.length < data.length * 0.6) {
        data = jpeg;
        filter = "DCTDecode";
      }
    }
    if (data.length >= original * 0.9) return false;

    ref.writeRawStream(data);
    ref.put("Filter", doc.newName(filter));
    ref.put("Width", nw);
    ref.put("Height", nh);
    ref.put("BitsPerComponent", 8);
    ref.put("ColorSpace", doc.newName("DeviceGray"));
    for (const key of ["DecodeParms", "Decode"]) ref.delete(key);
    return true;
  } finally {
    pix.destroy();
    image.destroy();
  }
}

// Réduction d'un plan de gris par moyenne de zone. Contrairement au rééchantillonnage de MuPDF
// (warp, prévu pour redresser des perspectives), elle n'ajoute pas de bruit dans les aplats,
// qui resteraient sinon coûteux à compresser.
function boxDownsample(src, w, h, stride, nw, nh) {
  const out = new Uint8Array(nw * nh);
  if (nw === w && nh === h) {
    for (let y = 0; y < h; y++) out.set(src.subarray(y * stride, y * stride + w), y * w);
    return out;
  }
  const sx = w / nw,
    sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy),
      y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx),
        x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * stride;
        for (let xx = x0; xx < x1; xx++) sum += src[row + xx];
      }
      out[y * nw + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return out;
}

function rewriteImage(doc, num, preset, displayed) {
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
    const w = image.getWidth(),
      h = image.getHeight();

    // Image jamais affichée (ou introuvable) : on n'y touche pas.
    const size = displayed.get(imageKey(w, h, image.getNumberOfComponents()));
    if (!size || size.w <= 0 || size.h <= 0) return false;
    const ppiX = w / (size.w / 72),
      ppiY = h / (size.h / 72);
    // L'axe le moins défini fixe la réduction : aucun axe ne descend sous la cible.
    const ratio = Math.min(1, Math.max(preset.ppi / ppiX, preset.ppi / ppiY));
    const resize = ratio < 1 / PPI_TOLERANCE;

    // Partie masquée par une découpe : remplie d'une couleur unie, que le JPEG compresse presque à
    // zéro. On ne recadre pas (il faudrait réécrire le contenu de la page) ; l'affichage ne change pas.
    const [u0, v0, u1, v1] = size.vis;
    const visibleArea = Math.max(0, u1 - u0) * Math.max(0, v1 - v0);
    const blank = visibleArea > 0 && visibleArea < BLANK_BELOW;

    // Un JPEG déjà à la bonne résolution reste tel quel (le réencoder perdrait de la qualité pour
    // rien), sauf s'il est enregistré en qualité maximale : on le ramène alors à la qualité du preset.
    const filter = ref.get("Filter").toString();
    const bytesPerSample = original / (w * h * image.getNumberOfComponents());
    if (!resize && !blank && filter.includes("DCTDecode") && bytesPerSample < HEAVY_JPEG) return false;

    let pix = image.toPixmap();
    trash.push(pix);

    // On garde l'espace colorimétrique d'origine (CMJN et profils ICC compris) : un fichier
    // d'impression doit rester en CMJN. Seuls les espaces que le JPEG ne sait pas porter
    // (indexé, séparations, DeviceN, Lab) ou une couche alpha passent en RVB.
    const cs = pix.getColorSpace();
    const native = cs && (cs.isGray() || cs.isRGB() || cs.isCMYK());
    const srcCs = image.getColorSpace();
    const keepCs =
      native && !pix.getAlpha() && srcCs && !srcCs.isIndexed() && !srcCs.isLab() && !srcCs.isDeviceN();
    if (!keepCs) {
      pix = pix.convertToColorSpace(
        cs?.isGray() ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB,
        false,
      );
      trash.push(pix);
    }

    if (blank) {
      // Marge de sécurité autour de la zone visible (rééchantillonnage, blocs JPEG de 8 px).
      const mx = Math.ceil(w * 0.01) + 8,
        my = Math.ceil(h * 0.01) + 8;
      const x0 = Math.max(0, Math.floor(u0 * w) - mx),
        x1 = Math.min(w, Math.ceil(u1 * w) + mx),
        y0 = Math.max(0, Math.floor(v0 * h) - my),
        y1 = Math.min(h, Math.ceil(v1 * h) + my);
      const n = pix.getNumberOfComponents(),
        stride = pix.getStride(),
        px = pix.getPixels();
      const fill = pix.getColorSpace().isCMYK() ? 0 : 255; // blanc, en CMJN comme en RVB/gris
      for (let y = 0; y < h; y++) {
        const row = y * stride;
        if (y < y0 || y >= y1) px.fill(fill, row, row + w * n);
        else {
          px.fill(fill, row, row + x0 * n);
          px.fill(fill, row + x1 * n, row + w * n);
        }
      }
    }

    let nw = w,
      nh = h;
    if (resize) {
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

    const jpeg = pix.asJPEG(preset.jpegQuality, false);
    // Sans réduction ni remplissage, un réencodage doit vraiment rapporter pour justifier la perte.
    if (jpeg.length >= original * (resize || blank ? 1 : 0.75)) return false;

    ref.writeRawStream(jpeg);
    ref.put("Filter", doc.newName("DCTDecode"));
    ref.put("Width", nw);
    ref.put("Height", nh);
    ref.put("BitsPerComponent", 8);
    if (!keepCs) ref.put("ColorSpace", doc.newName(pix.getColorSpace().isGray() ? "DeviceGray" : "DeviceRGB"));
    for (const key of ["DecodeParms", "Decode", "ColorTransform"]) ref.delete(key);
    return true;
  }
}
