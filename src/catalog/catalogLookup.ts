/** Finds the first catalog item whose string id matches the requested id. */
export function findById<T extends { readonly id: string }>(
  items: readonly T[],
  id: string
): T | undefined {
  return items.find((item) => item.id === id);
}
