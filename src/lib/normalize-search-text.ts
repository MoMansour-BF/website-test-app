/**
 * Normalize text for loose/fuzzy search matching.
 * Lowercases and removes diacritics (accents) so e.g. "movenpick" matches "Mövenpick".
 */
export function normalizeForSearch(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
