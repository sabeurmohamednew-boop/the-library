# Library Alpha UX/Bug Verification Report

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
