# Game Master Screen

This project uses the official PDF.js viewer locally, without a CDN.

## What to add

Put your four PDFs here:

- `pdfs/swade.pdf`
- `pdfs/sfc.pdf`
- `pdfs/starbreaker_core.pdf`
- `pdfs/starbreaker_star_marines.pdf`

Then add the PDF.js distribution files under `pdfjs/`.

### Recommended PDF.js download

Download `pdfjs-6.1.200-dist.zip` from the PDF.js SourceForge mirror, then unzip it into the `pdfjs/` folder so that this path exists:

- `pdfjs/web/viewer.html`

The PDF.js project recommends serving the files from a local web server rather than opening them with `file://`.

## Run on macOS

From this folder:

```bash
./serve.sh
```

Or:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## Editing

Edit these two files most often:

- `js/config.js` for PDFs and page shortcuts
- `js/sidebar.js` for collapsible notes and link blocks
