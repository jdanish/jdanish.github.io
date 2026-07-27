# GM Screen (stable build)

This package keeps your campaign data separate from the application code.

## Edit these files
- `data/config.js`
- `data/sidebar.js`

## Copy these application files over your existing install
- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/bookmarks.js`
- `js/search.js`
- `js/pdfviewer.js`
- `js/storage.js`
- `js/ui.js`
- `js/utils.js`

## Notes
- Bookmarks are saved in `localStorage`.
- The notes panel at the bottom of the sidebar is saved in `localStorage`.
- Keep your `pdfjs/` and `pdfs/` folders alongside this project.
- The viewer header no longer shows a duplicate page title; the book tabs already provide that context.

## Local test server
Run this from the project root on macOS:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
