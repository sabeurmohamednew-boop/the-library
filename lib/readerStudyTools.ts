"use client";

export type DictionaryLookupResult = {
  kind: "offline-unavailable";
  query: string;
  url: string;
};

function cleanSelection(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function dictionaryLookupForSelection(selection: string): DictionaryLookupResult | null {
  const query = cleanSelection(selection, 80).split(/\s+/).slice(0, 8).join(" ");
  if (!query) return null;

  return {
    kind: "offline-unavailable",
    query,
    url: `https://www.dictionary.com/browse/${encodeURIComponent(query)}`,
  };
}

export function translationUrlForSelection(selection: string) {
  const query = cleanSelection(selection, 500);
  if (!query) return "";

  return `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(query)}&op=translate`;
}

// TODO: Plug a packaged dictionary index here when the app ships offline dictionary data.
// The reader UI calls through this module so the future offline path does not need new UI wiring.
