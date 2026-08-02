/**
 * Returns categories ordered with pinned ones first (in their saved pin order),
 * followed by the remaining categories in their existing order. Used by every
 * category list so pinned favorites always appear first and consistently.
 */
export function orderCategories(categories: string[], pinned: string[]): string[] {
  const pinnedExisting = pinned.filter((c) => categories.includes(c));
  const rest = categories.filter((c) => !pinnedExisting.includes(c));
  return [...pinnedExisting, ...rest];
}
