export type BookFormat = "PDF" | "EPUB";
export type BookCategory = "SELF_IMPROVEMENT" | "NOFAP";

export type BlobDescriptor = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
};

export type BookDTO = {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  authors: string[];
  format: BookFormat;
  category: BookCategory;
  pageCount: number;
  publicationDate: string;
  uploadDate: string;
  bookBlobUrl: string;
  bookBlobPath: string;
  coverBlobUrl: string;
  coverBlobPath: string;
  fileSize: number;
  fileContentType: string;
  coverContentType: string;
  createdAt: string;
  updatedAt: string;
};

export type BookCoverDTO = Pick<BookDTO, "slug" | "title" | "format"> & Partial<Pick<BookDTO, "coverBlobPath" | "updatedAt">>;

export type LibraryBookDTO = Pick<
  BookDTO,
  "slug" | "title" | "description" | "author" | "authors" | "format" | "category" | "pageCount" | "publicationDate" | "uploadDate" | "coverBlobPath" | "updatedAt"
>;

export type ReaderBookDTO = Pick<BookDTO, "id" | "slug" | "title" | "author" | "format" | "pageCount">;

export type ReaderTheme = "light" | "dark" | "sepia" | "black";
export type ReaderLayout = "paginated" | "vertical";
export type ReaderFont = "original" | "default" | "system" | "literata" | "merriweather";
export type ReaderTextAlign = "left" | "justify";
export type ReaderProgressDisplay = "percentage" | "page" | "chapterPagesLeft" | "chapterTimeLeft" | "bookTimeLeft" | "hidden";
export type ReaderOrientation = "auto" | "portrait" | "landscape";
export type ReaderPageTurnAnimation = "none" | "slide" | "flip";
export type ReaderHighlightColor = "yellow" | "green" | "blue" | "pink";

export type ReaderLocator =
  | { type: "pdf-page"; page: number }
  | { type: "epub-cfi"; cfi: string }
  | { type: "epub-href"; href: string };

export type ReaderBookmark = {
  id: string;
  label: string;
  createdAt: string;
  locator: ReaderLocator;
  progress: number;
};

export type ReaderAnnotation = {
  id: string;
  kind: "highlight" | "note";
  quote: string;
  note?: string;
  color: ReaderHighlightColor;
  createdAt: string;
  updatedAt: string;
  locator: ReaderLocator;
  progress: number;
  label: string;
};

export type ReaderPreferences = {
  theme: ReaderTheme;
  layout: ReaderLayout;
  zoom: number;
  fitWidth: boolean;
  dualPage: boolean;
  brightness: number;
  fontFamily: ReaderFont;
  fontSize: number;
  lineHeight: number;
  margin: number;
  textAlign: ReaderTextAlign;
  paragraphSpacing: number;
  wordSpacing: number;
  letterSpacing: number;
  originalFormatting: boolean;
  normalizeText: boolean;
  progressDisplay: ReaderProgressDisplay;
  orientation: ReaderOrientation;
  pageTurnAnimation: ReaderPageTurnAnimation;
  showControls: boolean;
  immersiveMode: boolean;
  keepScreenAwake: boolean;
  tapZones: boolean;
  swipePaging: boolean;
  volumeKeyPaging: boolean;
  readAloudAutoStart: boolean;
  readAloudAutoTurn: boolean;
  readAloudRate: number;
  readAloudVoiceURI?: string;
  readAloudSkipSeconds: number;
};

export type ReaderStats = {
  minutesRead: number;
  sessions: number;
  streak: number;
  lastReadDate?: string;
};

export type ReaderState = ReaderPreferences & {
  slug: string;
  progress: number;
  pdfPage?: number;
  epubCfi?: string;
  locationLabel?: string;
  bookmarks: ReaderBookmark[];
  annotations: ReaderAnnotation[];
  stats: ReaderStats;
  lastOpenedAt: string;
};

export type TocItem = {
  id: string;
  label: string;
  locator: ReaderLocator;
  depth?: number;
};

export type SearchResult = {
  id: string;
  label: string;
  excerpt?: string;
  locator: ReaderLocator;
};
