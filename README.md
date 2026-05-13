# The Library

A minimalist self-hosted online library built with Next.js App Router, TypeScript, Prisma, Neon Postgres, Cloudflare R2, PDF.js, and epub.js.

The public site opens directly on the library. There are no reader accounts, signups, public upload controls, marketing pages, hero sections, pricing blocks, or promotional sections.

## Stack

- Next.js App Router
- TypeScript
- Prisma Client with PostgreSQL
- Neon Postgres for durable book metadata
- Cloudflare R2 for durable book files and cover images
- PDF.js for PDF reading
- epub.js for EPUB reading
- Browser `localStorage` for reader preferences, progress, and bookmarks

## Environment

Create environment variables from `.env.example`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DB?sslmode=require"
ADMIN_PASSWORD="replace-with-a-long-private-password"
ADMIN_SESSION_SECRET="replace-with-a-long-random-session-secret"
R2_ACCOUNT_ID="a3ce49be97bcba2cbf406de154b5f8b4"
R2_BUCKET_NAME="the-library-files"
R2_ACCESS_KEY_ID="replace-with-r2-access-key-id"
R2_SECRET_ACCESS_KEY="replace-with-r2-secret-access-key"
R2_ENDPOINT="https://a3ce49be97bcba2cbf406de154b5f8b4.r2.cloudflarestorage.com"
R2_PUBLIC_BASE_URL=""
```

Use Neon's pooled connection string for `DATABASE_URL`. Use Neon's direct connection string for `DIRECT_URL`, which Prisma CLI uses for migrations.

For local development with the same Vercel project variables, pull them with:

```bash
vercel env pull .env.local
```

Next.js reads `.env.local` automatically. Prisma CLI commands such as `npm run db:migrate` read `.env`, so either copy the Neon `DATABASE_URL` and `DIRECT_URL` into `.env` for local migration work or export them in your shell before running Prisma commands. Keep the R2 access key and secret in server-side environment variables only; they are used by server routes and are never exposed to client-side code.

## Setup

```bash
npm install
npm run db:migrate
npm run db:seed
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

The Next.js dev config allows `192.168.0.100` as a development origin so phone requests to dev assets and HMR are not blocked. If your PC gets a different LAN IP later, update `allowedDevOrigins` in `next.config.ts` and use that address on your phone.

## Production

Build and run the app with:

```bash
npm run build
npm run start
```

On Vercel, set the environment variables from `.env.example`, connect a Neon Postgres database, and create a Cloudflare R2 API token for the `the-library-files` bucket. Run migrations against Neon before relying on the deployment:

```bash
npm run db:migrate
```

If the migration has not been applied yet, public pages render a clear database-not-ready message instead of crashing, but no library data can load until the Neon schema exists.

Seed sample books only if you want demo content:

```bash
npm run db:seed
```

`npm run build` runs `prisma generate` before `next build`, and `postinstall` also regenerates Prisma Client for Vercel's dependency cache.

## Owner Import Workflow

The private import page is:

```text
/admin/import
```

It is not linked from the public library. The route requires `ADMIN_PASSWORD`; a successful password check sets an HTTP-only owner session cookie. Readers never see upload controls.

The import form uploads PDF/EPUB files and cover images through a protected server route. The route requires an owner session and writes objects to Cloudflare R2 with the S3-compatible API:

```text
/api/admin/r2/upload
```

After R2 upload completes, the admin API saves metadata and object pathnames in Postgres. Upload date is set automatically. The library listing updates immediately because pages read from the database on request.

If the R2 environment variables are missing, public browsing can still render metadata already stored in Neon, but import and replacement upload actions are blocked with an admin-facing error.

Accepted book files:

- `.pdf`
- `.epub`

Accepted cover images:

- JPG
- PNG
- WEBP
- AVIF

## Storage

Book files and covers are stored in Cloudflare R2 under these prefixes:

```text
books/
covers/
```

The existing database column names are kept for compatibility. They now store R2 object URLs/pathnames for new uploads:

```text
bookBlobUrl
bookBlobPath
coverBlobUrl
coverBlobPath
```

Public readers still access books through stable app routes:

```text
/api/books/[slug]/file
/api/books/[slug]/cover
```

Downloads use:

```text
/api/books/[slug]/file?download=1
```

The file route reads from R2 first, preserves byte range requests so PDF.js can seek efficiently, then falls back to local `storage/` files during development.

### Cloudflare R2 setup

Create a bucket named `the-library-files`, then create an R2 API token with object read/write access for that bucket. Add these variables to local `.env`/`.env.local` and to Vercel:

```env
R2_ACCOUNT_ID="a3ce49be97bcba2cbf406de154b5f8b4"
R2_BUCKET_NAME="the-library-files"
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_ENDPOINT="https://a3ce49be97bcba2cbf406de154b5f8b4.r2.cloudflarestorage.com"
R2_PUBLIC_BASE_URL=""
```

`R2_PUBLIC_BASE_URL` is optional because the app proxies files through server routes. Set it only if you later attach a public R2/custom domain and want stored metadata URLs to point at it.

## Reader Features

The shared reader shell handles:

- Back to The Library
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
- `bookBlobUrl`
- `bookBlobPath`
- `coverBlobUrl`
- `coverBlobPath`
- `fileSize`
- `fileContentType`
- `coverContentType`
- `searchText`
- `createdAt`
- `updatedAt`

Categories:

- Self-Improvement
- Philosophy
- Philosophical Fiction
- Psychology & Behavior
- Finance & Business
- Strategy & Power
- Addiction & Recovery

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
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
```

`postinstall` copies the PDF.js worker into `public/pdf.worker.mjs` for self-hosted PDF rendering after Prisma Client generation.

## Notes

- No public authentication is implemented for readers.
- Owner uploads require a valid admin session before files are accepted by the R2 upload route.
- Local files under `storage/books` and `storage/covers` are still supported as a development fallback.
- Cloudflare R2 and Neon are persistent across deploys, unlike Vercel's serverless filesystem.
- The admin upload route proxies file uploads through the Next.js server before writing to R2. Keep Vercel request limits in mind for very large files.
