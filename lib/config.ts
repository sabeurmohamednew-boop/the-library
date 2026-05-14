import type { ReaderPreferences } from "@/lib/types";
export {
  BOOK_CATEGORIES,
  BOOK_CATEGORY_VALUES,
  BOOK_FORMATS,
  LIBRARY_PAGE_SIZE,
  TRUNCATION_LIMITS,
  categoryLabel,
} from "@/lib/libraryConfig";

export const SITE_NAME = "The Library";

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  theme: "light",
  layout: "paginated",
  zoom: 100,
  fitWidth: true,
  dualPage: false,
  brightness: 100,
  fontFamily: "original",
  fontSize: 100,
  lineHeight: 1.55,
  margin: 32,
  textAlign: "left",
  paragraphSpacing: 0.75,
  wordSpacing: 0,
  letterSpacing: 0,
  originalFormatting: true,
  normalizeText: false,
  progressDisplay: "percentage",
  orientation: "auto",
  pageTurnAnimation: "slide",
  showControls: true,
  immersiveMode: false,
  keepScreenAwake: true,
  tapZones: true,
  swipePaging: true,
  volumeKeyPaging: false,
  readAloudAutoStart: false,
  readAloudAutoTurn: false,
  readAloudRate: 1,
  readAloudSkipSeconds: 15,
};
