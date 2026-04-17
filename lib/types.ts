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

export type ReaderTheme = "light" | "dark" | "sepia";
export type ReaderLayout = "paginated" | "vertical";
export type ReaderFont = "original" | "default" | "literata" | "merriweather";

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
};

export type ReaderState = ReaderPreferences & {
  slug: string;
  progress: number;
  pdfPage?: number;
  epubCfi?: string;
  locationLabel?: string;
  bookmarks: ReaderBookmark[];
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
