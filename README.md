# PDFShock

Compress PDF files in your browser: **[pdfshock.com](https://pdfshock.com)**

PDFShock shrinks heavy PDFs, such as decks exported from Figma, Canva or Keynote. Only images are recompressed, so text and vectors stay sharp, and the file never leaves your computer.

- **Local.** Compression runs in a Web Worker with [MuPDF.js](https://mupdf.com) (WebAssembly). The PDF is never uploaded.
- **Images only.** Text stays selectable and searchable, vectors stay vectors.
- **Print safe.** CMYK images and their ICC color profiles are kept. Leftover editor data is removed.
- **Three presets.** High quality (up to 300 ppi), Balanced (up to 110 ppi), Smallest (up to 72 ppi). Images are only ever downscaled.
- **Free.** No account, no cookies.

Exporting from Figma? The [PDFShock plugin](https://www.figma.com/community/plugin/1686531654808343365) makes the PDF light at export time. On a 48-slide, image-heavy deck: 88.2 MB with Figma's native export, 16.5 MB with Balanced, 7.1 MB with Smallest file.

Why Figma PDFs get so heavy, and how to fix it: [pdfshock.com/figma-pdf-too-large](https://pdfshock.com/figma-pdf-too-large)

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build in dist/
npm test           # compresses a synthetic deck with the 3 presets
```

`server/` holds the small Node service behind api.pdfshock.com (anonymous counters and the mini-game leaderboard).

## License

[AGPL-3.0](LICENSE), because PDFShock is built on MuPDF. Made by Maxime Thierry. Contact: plugins@maximethierry.fr
