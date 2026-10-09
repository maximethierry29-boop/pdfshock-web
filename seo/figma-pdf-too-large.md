# Page guide : /figma-pdf-too-large

Texte source de la page (anglais). Seuls des faits vérifiés : moteur décrit dans CLAUDE.md, fiche plugin
(mesure du deck de 48 slides), page légale. Aucun chiffre sur le site web tant qu'il n'est pas mesuré.

---

## Meta

- Title : Figma PDF export too large? How to make it smaller | PDFShock
- Meta description : Why Figma PDF exports get so heavy, and three ways to shrink them while keeping text and vectors sharp. Free, and your file never leaves your computer.
- URL : https://pdfshock.com/figma-pdf-too-large

---

# Why is my Figma PDF so large, and how do I make it smaller?

By Maxime Thierry, designer and maker of PDFShock. Updated October 9, 2026.

**Short answer.** A heavy Figma PDF almost always comes from its images. Photos and screenshots are stored with far more pixels than the page shows. To shrink the file, recompress only those images and leave text and vectors alone. PDFShock does it in your browser, for free, and your file never leaves your computer.

## Where the weight comes from

A Figma PDF holds two kinds of content.

- **Text and vector shapes.** They describe forms with math, so they stay light and sharp at any zoom.
- **Images.** Photos, screenshots and image fills are grids of pixels. A photo dropped into a frame often keeps far more pixels than the frame needs, and a deck with dozens of them adds up fast.

That is why a text-heavy document exports light, while an image-heavy pitch deck can reach tens of megabytes. Too heavy to email, slow to open, rejected by upload limits.

## Three ways to make it smaller

### 1. Compress the PDF you already exported

Drop the file on [pdfshock.com](https://pdfshock.com/), pick a preset and click Zap it.

- Only images are recompressed. Text stays selectable and searchable, vectors stay vectors.
- CMYK images and ICC color profiles are kept, so print colors do not shift.
- Everything runs in your browser. The PDF is never uploaded to a server.

It works with PDFs from Figma, and also from Canva, Keynote or any other tool.

### 2. Export a light PDF straight from Figma

The [PDFShock plugin](https://www.figma.com/community/plugin/1686531654808343365) replaces Figma's PDF export. Select your frames or slides, pick a preset, export.

Measured on a 48-slide, image-heavy deck:

| Export | File size |
|---|---|
| Figma native PDF export | 88.2 MB |
| PDFShock plugin, Balanced | 16.5 MB (81% lighter) |
| PDFShock plugin, Smallest file | 7.1 MB (92% lighter) |

Text stays selectable and searchable, and links stay clickable.

### 3. Shrink images before they reach the PDF

Before placing a photo in Figma, resize it to roughly the size it will be shown at. It takes more time, and you have to repeat it each time an image changes, but the native export gets lighter.

## Which preset should I choose?

| Preset | Image resolution | Best for |
|---|---|---|
| High quality | up to 300 ppi | Print, zooming in on details |
| Balanced | up to 110 ppi | Presentations and sharing on screen |
| Smallest | up to 72 ppi | Email attachments, strict upload limits |

Not sure? Start with Balanced. If small text in a screenshot looks soft, try High quality.

## FAQ

### Does PDFShock upload my file?
No. Compression runs in your browser with MuPDF, compiled to WebAssembly. The PDF never leaves your computer. The site only counts anonymous events, such as file size before and after, with no file content.

### Will my text stay selectable?
Yes. On pdfshock.com only images are recompressed, so text and vectors are untouched. With the Figma plugin, text stays selectable and searchable too.

### Are CMYK colors kept?
Yes, on pdfshock.com: CMYK images and their ICC color profiles are kept as they are. The Figma plugin exports in RGB, like Figma itself.

### My PDF has almost no images. Will it get smaller?
Not by much. PDFShock recompresses images and removes leftover editor data. A PDF made mostly of text and vectors is already light.

### Is it free?
Yes, with no sign-up and no account. If it saves you time, you can buy me a coffee on Ko-fi. It's optional and unlocks nothing.

### Website or plugin, which one?
Use the plugin when you export from Figma: the PDF comes out light from the start. Use the website when you already have a heavy PDF, from Figma or any other tool.

---

[Compress a PDF now](https://pdfshock.com/) · [Get the Figma plugin](https://www.figma.com/community/plugin/1686531654808343365)
