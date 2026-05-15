# Library Alpha UX/Bug Verification Report

## 2026-05-15 Vercel Image Optimization Audit

Target tested: local app at `http://127.0.0.1:3000/` using `npm run dev -- --hostname 127.0.0.1`  
Browser method: Playwright Chromium, desktop viewport `1440x1000`, mobile viewport `390x844`  
Scope: `/api/books/[slug]/cover`, `next/image` usage, `/_next/image` behavior, R2 cover objects, headers, cache behavior, concurrency, and source image validity.

### Finding

The most likely production failure mode is transient CDN image optimizer failure during cold or uncached optimization, not a crashing cover API route. The cover API returned valid image responses locally and the sampled R2 objects all decoded successfully, but optimizer misses currently depend on a multi-hop path:

`/_next/image` -> `/api/books/[slug]/cover` -> database lookup -> R2 `GetObject` stream -> optimizer decode/resize/transcode.

This is fragile under concurrent homepage loads when source covers are large, especially large PNGs. The biggest current outlier is `ikigai-the-japanese-secret-to-a-long-and-happy-life`: `8,939,726` bytes, `2492x3220`, PNG. Several other PNG covers are 1.5 MB to 3.6 MB. These are displayed around 108-214 CSS px on the homepage, so source transfer and decode cost are disproportionate on optimizer cache misses.

### Differentiation

| Signal | Interpretation |
| --- | --- |
| API route 200 with image content | Backend/API is healthy. |
| `/_next/image` failure while API does not crash | CDN optimizer/origin fetch/decode/transcode failure is more likely than application crash. |
| Browser `requestfailed` with cancellation during navigation/view changes | Usually harmless client abort/expected browser cancellation. |
| 404/503 JSON from `/api/books/[slug]/cover` | Actual backend/data/config failure; these responses use `Cache-Control: no-store`. |

### Route And Header Audit

- `/api/books/[slug]/cover` runs in Node, does not generate covers at request time, and is not CPU-heavy itself.
- R2 responses are streamed through `NextResponse`; the route does not buffer image bytes in application code.
- Successful R2 cover responses include `Content-Type`, `Content-Length` when available, `ETag`, `Last-Modified`, `Cache-Control: public, max-age=31536000, immutable`, `CDN-Cache-Control`, `Vercel-CDN-Cache-Control`, and `X-Content-Type-Options: nosniff`.
- Error responses are JSON with `Cache-Control: no-store`, which is correct for missing/temporary backend failures.
- No redirects were found in the cover route.
- Local fallback is development-only in practice when R2 is not configured; local fallback uses `no-store`.
- No blur placeholders are configured, so blur placeholder generation is not contributing to the issue.

### Image/Object Audit

Checked all 41 database cover records against R2 with `sharp` metadata decode:

- Corrupted/malformed covers found: `0`
- DB content-type vs R2 content-type mismatches found: `0`
- Formats present: JPEG, PNG, WEBP
- Largest source covers:
  - `ikigai-the-japanese-secret-to-a-long-and-happy-life`: 8.9 MB PNG, `2492x3220`
  - `the-enchiridion-or-handbook-with-a-selection-from-the-discourses-of-epictetus`: 3.6 MB PNG, `1024x1536`
  - `the-four-agreements-a-practical-guide-to-personal-freedom`: 3.2 MB PNG, `1024x1536`
  - `why-you-should-never-masturbate-the-biggest-discovery-in-medical-science-uncover-2`: 2.7 MB PNG, `1024x1536`
  - `rich-dad-poor-dad-what-the-rich-teach-their-kids-about-money-that-the-poor-and-m`: 2.6 MB PNG, `1024x1536`

### Homepage Loading Audit

Initial homepage renders 12 gallery covers. Playwright saw exactly 12 browser-visible `/_next/image` requests on desktop and mobile, all 200, with no browser request failures.

- Desktop screenshot: `verification-artifacts/desktop-after-cover-audit.png`
- Mobile screenshot: `verification-artifacts/mobile-after-cover-audit.png`
- Cold/waterfall screenshot: `verification-artifacts/desktop-cover-audit-cold.png`

Warm local optimizer results were small WebP responses, typically 3.7 KB to 16.8 KB. That confirms optimization is valuable for large PNG/JPEG covers and should not be blindly bypassed for all covers.

### Timing Measurements

Concurrent direct API requests for the first 12 homepage covers before the route query change:

- Fastest: about 1.4s
- Slowest: about 5.4s for `ikigai`
- The slowest requests correlate with large source image transfer, not malformed content.

Concurrent unique-source optimizer requests before the route query change:

- Fastest: about 0.35s
- Slowest: about 4.6s for `ikigai`

After the route query change:

- The route logs `coverBySlug` and no longer runs the full book serialization/publication-year path.
- End-to-end direct API and optimizer timings remained noisy and still dominated by R2 transfer/decode, with `ikigai` still around 5s on the direct API path.
- Impact is reduced backend query pressure and less DB work per optimizer miss, not a large visible latency improvement for the biggest covers.

### Changes Made

- `app/api/books/[slug]/cover/route.ts` now uses a cover-specific lookup instead of `getBookBySlug`.
- `lib/books.ts` adds `getBookCoverBySlug`, selecting only identity and cover fields.
- `next.config.ts` now accepts either `R2_PUBLIC_BASE_URL` or `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` for the public R2 base URL. When configured, this lets `next/image` fetch a public R2 origin directly instead of routing optimizer misses through the application cover API.

### Recommendations

- Configure a public R2/custom-domain base URL in production and let Next optimize from that remote origin. This bypasses the serverless cover API for optimizer misses while preserving optimized image quality.
- Keep `next/image` optimization for large PNG/JPEG covers; do not globally set `unoptimized`.
- Consider replacing oversized PNG covers with web-optimized JPEG/WebP derivatives at upload/admin time. This is the highest-impact reliability and perceived performance fix for cold optimizer misses.
- Consider `unoptimized` only for already-small WebP covers if production observability still shows optimizer strain; current WEBP covers are small enough, but this should be content-aware rather than global.
- Keep browser cancellations separate from failures. A cancelled image during navigation/view changes should not be counted as backend instability.

### Verification

- `npm run typecheck`: passed
- `npm run lint`: passed
- Playwright desktop/mobile homepage screenshots: passed
- R2 object metadata/decode audit for 41 covers: passed

Date: 2026-05-14  
Target tested: local app at `http://127.0.0.1:3000/` using `npm run dev -- --hostname 127.0.0.1`  
Browser method: Playwright Chromium, desktop viewport `1440x1000`, mobile viewport `390x844`

No production code changes were made during this verification pass.

## Artifacts

Screenshots were saved under `verification-artifacts/`, including:

- `desktop-home.png`
- `desktop-search-habits.png`
- `desktop-search-discipline.png`
- `desktop-search-atomic.png`
- `desktop-search-qwertyzzzz.png`
- `desktop-view-gallery.png`
- `desktop-view-list.png`
- `desktop-view-cover.png`
- `desktop-sort-open-click.png`
- `desktop-sort-title-asc.png`
- `desktop-sort-title-desc.png`
- `desktop-sort-publication-desc.png`
- `desktop-reader-initial.png`
- `desktop-reader-after-keyboard.png`
- `desktop-reader-visible-next.png`
- `desktop-reader-search-habit-filled.png`
- `mobile-home.png`
- `mobile-search-atomic.png`
- `mobile-sort-title-desc.png`
- `mobile-view-list.png`
- `mobile-view-cover.png`

## Summary

| Original issue | Status |
| --- | --- |
| Homepage search ignored queries | Fixed |
| Sort dropdown showed a large black rectangle | Fixed |
| Header typography made "The Library" look like "T h e Library" | Fixed |
| EPUB reader progress stayed at `0%` / `Location 1 of 1` | Fixed |
| Reader search produced duplicate results for same location | Partially fixed |
| Pressing Enter hid/replaced search input with filters | Fixed |

## 1. Homepage Search Ignored Queries

Status: fixed

Steps performed:
- Opened the homepage.
- Typed each query into the visible `Search books` input and pressed Enter: `habits`, `discipline`, `atomic`, `qwertyzzzz`.
- Checked visible result count, visible book list, URL, and input value after each search.
- Cleared the search with `Clear search`.

Expected result:
- Search should filter the library.
- Counts and visible books should change per query.
- A nonsense query should show zero results.

Actual result:
- `habits`: `4 results`; visible results included `17 Anti-Procrastination Hacks`, `Atomic Habits`, `Awaken the Giant Within`, and `The Seven Habits of Highly Effective People`.
- `discipline`: `5 results`; visible results included `12 Rules for Life`, `Can't Hurt Me`, `Ego is the Enemy`, `The Enchiridion`, and `The Slight Edge`.
- `atomic`: `1 result`; visible result was `Atomic Habits`.
- `qwertyzzzz`: `0 results`.
- Clearing search restored `41 results`.

Screenshots:
- `verification-artifacts/desktop-search-habits.png`
- `verification-artifacts/desktop-search-discipline.png`
- `verification-artifacts/desktop-search-atomic.png`
- `verification-artifacts/desktop-search-qwertyzzzz.png`

## 2. Sort Dropdown Black Rectangle

Status: fixed

Steps performed:
- Searched for `habits`.
- Inspected and clicked the `Sort books` select.
- Verified option text and control styling.
- Selected `Title A-Z`, `Title Z-A`, and `Publication date newest`.

Expected result:
- Sort options should be visible/readable/clickable.
- No black overlay should block or replace the options.
- Changing sort order should reorder the visible books.

Actual result:
- The select was visible and enabled.
- Options were readable: `Title A-Z`, `Title Z-A`, `Publication date newest`, `Publication date oldest`, `Upload date newest`, `Upload date oldest`.
- Computed style showed readable text/background: color `rgb(94, 99, 92)`, background `rgba(255, 255, 255, 0.72)`.
- Sorting changed order:
  - `Title A-Z` started with `17 Anti-Procrastination Hacks`.
  - `Title Z-A` started with `The Seven Habits of Highly Effective People`.
  - `Publication date newest` started with `Atomic Habits`.

Screenshots:
- `verification-artifacts/desktop-sort-open-click.png`
- `verification-artifacts/desktop-sort-title-asc.png`
- `verification-artifacts/desktop-sort-title-desc.png`
- `verification-artifacts/desktop-sort-publication-desc.png`

## 3. Header Typography

Status: fixed

Steps performed:
- Opened homepage on desktop and mobile.
- Visually inspected screenshots.
- Checked computed typography for `.site-title`.

Expected result:
- Header should read naturally as `The Library`, without excessive spacing between `T`, `h`, and `e`.

Actual result:
- Desktop and mobile screenshots show normal word spacing.
- Desktop computed `letter-spacing`: `normal`; `font-kerning`: `normal`.
- Mobile computed `letter-spacing`: `normal`.

Screenshots:
- `verification-artifacts/desktop-home.png`
- `verification-artifacts/mobile-home.png`

## 4. EPUB Reader Progress

Status: fixed

Steps performed:
- Opened `Atomic Habits` via its `Read` link.
- Waited for the EPUB reader to load.
- Turned pages using keyboard `ArrowRight`.
- Turned pages using the visible on-screen `Next page or location` button.
- Checked displayed progress/location text after navigation.

Expected result:
- Progress should not remain stuck at `0%` and `Location 1 of 1` after turning pages.

Actual result:
- Initial state showed `Calculating progress...`.
- After keyboard navigation, progress changed from `0%` to `1%`.
- Location changed to `Location 1 of 2`, then `Location 2 of 2`.
- The visible on-screen next button was present and clickable; after several clicks it advanced to `Location 1 of 2`.
- This verifies the original stuck `Location 1 of 1` behavior is no longer present.

Remaining UX concern:
- Progress can show duplicate `0%` text while locations are still being generated, and the first few page turns can still display `0%`. This is not the original stuck-state bug, but it may still feel laggy/confusing.

Screenshots:
- `verification-artifacts/desktop-reader-initial.png`
- `verification-artifacts/desktop-reader-after-keyboard.png`
- `verification-artifacts/desktop-reader-visible-next.png`

## 5. Reader Search Duplicates

Status: partially fixed

Steps performed:
- Opened `Atomic Habits` in the EPUB reader.
- Used the reader search input labeled `Find in book`.
- Searched for `habit`.
- Inspected the visible results and result DOM.

Expected result:
- Results should be deduplicated or at least not repeated uselessly for the same location.

Actual result:
- Search worked and displayed results instead of failing.
- It showed `Showing first 80 matches.`
- Exact duplicate rows were not obvious in the first visible batch.
- However, many results are still highly repetitive/overlapping within the same EPUB section. Example repeated cluster from `xhtml/06_Introduction_My_Story.xhtml`:
  - `...sleep habits, study habits, and strength-training habits really bega`
  - `...sleep habits, study habits, and strength-training habits really began to pay off..`
  - `...my senior season that my sleep habits, study habits, and strength-training habits really began to pay off....`
- This is better than identical duplicate rows, but still repeated enough to be a remaining UX issue.

Recommended next fix:
- Deduplicate EPUB search results by normalized CFI/range when available, or by a stable key such as `section href + normalized excerpt window`.
- Consider merging nearby matches in the same paragraph into one result with highlighted matches.

Screenshot:
- `verification-artifacts/desktop-reader-search-habit-filled.png`

## 6. Pressing Enter Hid/Replaced Search Input

Status: fixed

Steps performed:
- Typed search terms on desktop and mobile.
- Pressed Enter.
- Checked whether the search input remained visible and usable.
- Cleared the search.
- Switched Gallery/List/Cover views after searching.

Expected result:
- Pressing Enter should not make the search input disappear or become unusable.
- Filters can appear, but the search input should remain available and clearable.

Actual result:
- After pressing Enter, the full controls appear and the `Search books` input remains visible.
- The input retained its query value and could be edited for the next query.
- `Clear search` cleared the input and restored `41 results`.
- Gallery/List/Cover controls remained clickable after searching on desktop and mobile.

Screenshots:
- `verification-artifacts/desktop-view-gallery.png`
- `verification-artifacts/desktop-view-list.png`
- `verification-artifacts/desktop-view-cover.png`
- `verification-artifacts/mobile-view-list.png`
- `verification-artifacts/mobile-view-cover.png`

## Desktop And Mobile Viewport Notes

Desktop:
- Search, clear, view switching, sort, and EPUB reader navigation were tested.

Mobile:
- Homepage search for `atomic` produced `1 result`.
- Search input remained visible and usable.
- `habits` search, `Title Z-A` sort, List view, and Cover view were tested.
- Header spacing remained normal.

## Console And Network Findings

Ignored expected development noise:
- React DevTools suggestion.
- Vercel Analytics/Speed Insights debug messages.
- Next.js HMR/Fast Refresh messages.
- Local app diagnostic logs such as `[reader-shell]` and `[epub-reader]`.

Observed warnings/errors:
- Repeated reader warnings while navigating/searching `Atomic Habits`:
  - `Failed to decode downloaded font: blob:http://127.0.0.1:3000/...`
  - `OTS parsing error: CFF : Failed validating CharStrings INDEX / Failed to parse table`
- One failed request was recorded during reader loading:
  - `GET http://127.0.0.1:3000/api/books/atomic-habits/file` with `net::ERR_ABORTED`
- No failed requests were observed during the mobile homepage search/sort/view pass.

Recommended next fixes:
- Keep reader-search deduplication as the primary remaining issue.
- Investigate the EPUB font decode warnings if they affect rendering or console quality.
- Investigate whether the aborted EPUB file request is an expected dev-mode duplicate fetch cancellation or an avoidable double request.

## Follow-Up Fix Pass

Date: 2026-05-14  
Target tested: local app at `http://127.0.0.1:3000/` using `npm run dev -- --hostname 127.0.0.1`  
Browser method: Playwright Chromium, desktop viewport `1440x1000`

### Root Cause

Reader search repetition:
- EPUB search uses epub.js `item.find(query)`.
- For common terms, epub.js returns one match per occurrence. When several occurrences are close together in the same sentence or paragraph, those matches have different CFIs and slightly shifted excerpts.
- The previous dedupe handled exact CFI/exact excerpt repeats, but did not catch overlapping excerpt windows from the same spine item.

Aborted EPUB file request:
- The aborted `GET /api/books/atomic-habits/file` was caused by the reader load effect starting a fetch during the first development React Strict Mode effect pass.
- React then immediately cleaned up that throwaway effect pass, aborting the request, and started the real effect pass.
- This was avoidable in development by deferring the fetch start until the next task and cancelling that timer during cleanup.

EPUB font decode warnings:
- The warnings come from publisher-embedded EPUB `@font-face` rules inside the rendered iframe, not from the app shell or the file API.
- Playwright inspection found `@font-face` rules for `"Free Sans"` loaded from epub.js blob URLs in the Atomic Habits content iframe.
- Chromium reports `OTS parsing error: CFF : Failed validating CharStrings INDEX` for one of those embedded font blobs, then falls back to the book CSS font stack. The reader still renders text.
- No app code change was made for this because stripping publisher fonts would alter the "Preserve publisher formatting" behavior. This remains documented as harmless unless it causes visible rendering loss in a specific EPUB.

### Files Changed

- `components/reader/EpubReader.tsx`
- `VERIFY_FIXES_REPORT.md`
- Added screenshot artifact: `verification-artifacts/desktop-reader-search-habit-after-fix.png`

### Fixes Applied

Reader search:
- Added overlap-aware excerpt deduplication scoped by EPUB spine href.
- The dedupe treats two results as repeated when their normalized excerpts are effectively the same text window, including shared seven-word runs or high word-overlap.
- Exact CFI and exact content-key dedupe are still kept.

Reader loading:
- Deferred `loadBook()` with a zero-delay timer.
- Cleanup now cancels that timer before it starts a fetch. This avoids the dev Strict Mode throwaway fetch while preserving the existing abort behavior once a real fetch is in progress.

Font warnings:
- No code change. The cause is publisher-embedded font data in the EPUB, and browser fallback works.

### Commands Run

- `npm run lint`
- `npm run build`
- Focused Playwright verification against `http://127.0.0.1:3000/read/atomic-habits`

### Verification Result

Reader search:
- Searched `habit` inside `Atomic Habits`.
- Saved screenshot: `verification-artifacts/desktop-reader-search-habit-after-fix.png`.
- The previous repeated cluster for `sleep habits, study habits, and strength-training habits` collapsed to one visible result.
- The visible result panel still contains useful matches across contents and introduction sections.

Reader loading/network:
- Observed exactly one `GET http://127.0.0.1:3000/api/books/atomic-habits/file`, status `200`.
- No failed Playwright network requests were recorded during the focused reader pass.
- EPUB progress still updated after navigation: after several `ArrowRight` presses, the reader showed `1%` and `Location 2 of 2`.

Console:
- The embedded EPUB font warnings still appear:
  - `Failed to decode downloaded font: blob:http://127.0.0.1:3000/...`
  - `OTS parsing error: CFF : Failed validating CharStrings INDEX / Failed to parse table`
- These are documented as publisher font fallback warnings. No reader failure or missing text was observed.

## Load More First-Click Fix

Date: 2026-05-14  
Target tested: local app at `http://localhost:3000/` using `npm run dev`  
Browser method: Playwright Chromium, desktop viewport `1280x900`, mobile viewport `390x844`

### Root Cause

The first `Load more books` click in `LibraryInteractivityLoader` correctly fetched the full library and mounted `LibraryClient` with `initialVisibleCount={24}`.

On mount, `LibraryClient` immediately ran its reset effect for `[view, sort, format, category, bookmarkedOnly, deferredSearch]` and set `visibleCount` back to the gallery page size of `12`. In development, React Strict Mode also reruns mount effects, so a simple "skip first effect" guard was not enough.

### Files Changed

- `components/library/LibraryClient.tsx`
- `VERIFY_FIXES_REPORT.md`

### Fix Applied

`LibraryClient` now stores the initial visible-count reset key and only resets `visibleCount` after the actual control state changes. This preserves the loader's first-click `24` count while keeping the existing reset behavior for search, sort, filters, bookmarks, and view changes.

### Verification Steps

- Reproduced the original bug before editing: first click stayed at `12` cards, second click increased to `24`.
- Verified first click after the fix: `12 -> 24` cards.
- Verified no document navigation/reload during load more; URL stayed unchanged and no document request was recorded after the click.
- Verified load more after hydrated search for `the`: `12 -> 24` cards.
- Verified load more after format filter `EPUB`: `12 -> 24` cards.
- Verified load more after category filter `SELF_IMPROVEMENT`: `12 -> 17` cards.
- Verified switching `Gallery -> List -> Cover -> Gallery`, then load more: `12 -> 24` cards.
- Verified mobile first click at `390x844`: `12 -> 24` cards.
- Checked browser console and failed network requests during these passes.

### Commands Run

- `npm run lint`
- `npm run build`

### Result

Passed. `Load more` works on the first click, does not reload the page, and still works after searching, filtering, view switching, and on mobile. No console errors or failed network requests were observed in the focused library verification.

## Load More First-Click Scroll Reset Fix

Date: 2026-05-14  
Target tested: local app at `http://localhost:3000/` using `npm run dev`  
Browser method: Playwright Chromium, desktop viewport `1280x900`

### Root Cause

The remaining first-click bug was not a form submit or full document reload. The initial `Load more books` control already had `type="button"`, the search form called `preventDefault()`, the URL stayed unchanged, and `beforeunload` did not fire.

The first click replaced `LibraryInteractivityLoader`'s server-rendered browse section with the dynamically imported `LibraryClient`. `LibraryClient` then had a second dynamic boundary for `InteractiveLibraryResults`, so the first activation committed in two phases. The old clicked button disappeared during that replacement and the viewport ended up back at the top even though the books loaded.

### Files Changed

- `components/library/LibraryInteractivityLoader.tsx`
- `components/library/LibraryClient.tsx`
- `VERIFY_FIXES_REPORT.md`

### Fix Applied

`LibraryInteractivityLoader` now snapshots `window.scrollY` before the first interactive activation and restores it in a layout effect after the interactive client mounts.

`LibraryClient` now imports `InteractiveLibraryResults` directly. Since `LibraryClient` is already loaded on demand by `LibraryInteractivityLoader`, the extra inner dynamic import was unnecessary and caused a delayed result-grid replacement after the first activation.

### Verification Steps

- Reproduced the remaining bug before this fix: first click changed `12 -> 24` books, URL stayed `http://localhost:3000/`, `beforeunload` stayed `0`, but scroll changed from `1339` to `0`.
- Verified first click after the fix: `12 -> 24` books, URL unchanged, `beforeunload` stayed `0`, scroll stayed `1339`.
- Verified second click after the fix: `24 -> 36` books, URL unchanged, scroll stayed stable.
- Verified search mode load more for `the`: `12 -> 24` books, scroll delta `0`, URL unchanged.
- Verified format filter load more for `EPUB`: `12 -> 24` books, scroll delta `0`, URL unchanged.
- Verified category filter load more for `SELF_IMPROVEMENT`: `12 -> 17` books, scroll delta `0`, URL unchanged.
- Verified Cover view switch: all 41 covers rendered; no Load More button is expected because cover page size is 48.
- Verified List view switch: titles rendered; no Load More button is expected for list view.
- Checked for failed Playwright network requests and browser console errors during the focused passes.

### Commands Run

- `npm run lint`
- `npm run build`

### Result

Passed. The first `Load more books` click now loads more books without reloading the document, changing the URL, or resetting scroll to the top. The second click and search/filter/view-mode behavior still work.
