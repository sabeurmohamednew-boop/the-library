# The Library

A minimalist self-hosted online library built with Next.js App Router, TypeScript, Prisma, SQLite, PDF.js, and epub.js.

The public site opens directly on the library. There are no reader accounts, signups, public upload controls, marketing pages, hero sections, pricing blocks, or promotional sections.

## Stack

- Next.js App Router
- TypeScript
- Prisma Client with SQLite
- PDF.js for PDF reading
- epub.js for EPUB reading
- Local filesystem storage under `storage/books` and `storage/covers`
- Browser `localStorage` for reader preferences, progress, and bookmarks

## Setup

```bash
npm install
```

Create environment variables from `.env.example`:

```env
DATABASE_URL="file:./dev.db"
ADMIN_PASSWORD="replace-with-a-long-private-password"
ADMIN_SESSION_SECRET="replace-with-a-long-random-session-secret"
```

Initialize the SQLite table and indexes:

```bash
npm run db:init
```

Seed sample metadata, PDFs, EPUBs, and local cover images:

```bash
npm run db:seed
```

Start development:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`.

For phone testing on the same Wi-Fi, start the dev server on all interfaces:

```bash
npm run dev -- -H 0.0.0.0
```

Then open:

```text
http://192.168.0.100:3000
```

The local `.env` file should define `DATABASE_URL="file:./dev.db"` for the SQLite database at `prisma/dev.db`. The Next.js dev config allows `192.168.0.100` as a development origin so phone requests to dev assets and HMR are not blocked. If your PC gets a different LAN IP later, update `allowedDevOrigins` in `next.config.ts` and use that address on your phone.

## Production

Build and run the app with:

```bash
npm run build
npm run start
```

For a deployed server, set the same environment variables from `.env.example` in the hosting environment. Keep `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` long, private, and different from the example values.

SQLite and local uploads are intentionally simple for self-hosting, but both need persistent storage in production:

- `DATABASE_URL` should point to a SQLite file on a persistent disk or volume.
- `storage/books` and `storage/covers` must be writable by the app process and backed up.
- Containers, serverless filesystems, and ephemeral hosts need a mounted volume for both the SQLite database and `storage/`.
- If the app sits behind a reverse proxy, configure request body limits high enough for owner EPUB/PDF uploads.

### Vercel demo deployment

The current Vercel demo setup can use:

```env
DATABASE_URL="file:./dev.db"
ADMIN_PASSWORD="..."
ADMIN_SESSION_SECRET="..."
```

During Vercel builds, `npm run build` regenerates Prisma Client and prepares a temporary seeded SQLite demo database with local sample files. The generated demo database and sample storage files are included in Vercel's serverless output for reading.

This is suitable for a demo deployment only. Vercel's serverless filesystem is not persistent for owner uploads or durable database writes, so admin imports/edits/deletes may not survive redeploys or may fail depending on runtime filesystem permissions.

## Owner Import Workflow

The private import page is:

```text
/admin/import
```

It is not linked from the public library. The route requires `ADMIN_PASSWORD`; a successful password check sets an HTTP-only owner session cookie. Readers never see upload controls.

The import form lets the owner upload a PDF or EPUB, upload a cover image, enter required metadata, and save the book into SQLite plus local storage. Upload date is set automatically. The library listing updates immediately because pages read from the database on request.

Accepted book files:

- `.pdf`
- `.epub`

Accepted cover images:

- JPG
- PNG
- WEBP
- AVIF

## Storage

Book files and covers are stored outside `public/`:

```text
storage/books
storage/covers
```

Public readers access them through API routes:

```text
/api/books/[slug]/file
/api/books/[slug]/cover
```

Downloads use:

```text
/api/books/[slug]/file?download=1
```

PDF file streaming supports byte ranges so PDF.js can seek efficiently.

## Reader Features

The shared reader shell handles:

- Back to library
- Book title
- Search in book
- Table of contents panel
- Current-location bookmarks
- Bookmark list
- Share current reader URL
- Fullscreen
- Light, dark, and sepia themes
- Vertical and paginated layouts
- Fit-width toggle
- Zoom controls
- Dual-page display on larger screens
- Brightness control
- Progress bar
- Last-location persistence per book
- Local reader preferences per book
- Page/location overlay after navigation
- Keyboard shortcuts
- Progressive wake lock support

PDF-specific support:

- PDF.js rendering
- Text layer for selection
- Annotation layer for links
- Page navigation
- Search with page results and current-page highlights
- PDF outline table of contents when available
- Viewer-level theme, zoom, fit-width, brightness, and dual-page controls

EPUB-specific support:

- epub.js reflowable reading
- CFI location persistence
- EPUB table of contents
- Theme changes
- Font family, size, line height, and margin controls
- Search across spine items where epub.js can parse the content

Some browser and document capabilities vary. Wake lock, EPUB full-book search, PDF outline data, and internal document links are progressive enhancements and fail safely when unsupported or unavailable.

## Local Persistence

The browser stores per-book reader state in `localStorage`:

```text
library:reader:[slug]
```

Book-level bookmarks for library filtering are stored in:

```text
library:bookmarked-books
```

Stored reader state includes progress, PDF page, EPUB CFI, zoom, theme, layout mode, fit width, EPUB font settings, location bookmarks, and last opened timestamp.

## Book Model

The database stores:

- `id`
- `slug`
- `title`
- `description`
- `author`
- `format`
- `category`
- `pageCount`
- `publicationDate`
- `uploadDate`
- `coverImagePath`
- `filePath`
- `fileSize`
- `searchText`
- `createdAt`
- `updatedAt`

Categories:

- Self-improvement
- Nofap

Formats:

- PDF
- EPUB

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run db:init
npm run db:seed
```

`postinstall` copies the PDF.js worker into `public/pdf.worker.mjs` for self-hosted PDF rendering.

## Notes

- No third-party paid services are required.
- No public authentication is implemented for readers.
- Uploaded files are local to the server filesystem for now.
- The SQLite setup script creates the table and indexes with Prisma Client, then the app uses Prisma Client for all database reads and writes.
