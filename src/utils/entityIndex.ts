/** Preserve every target of an entity without scanning all devices per HA event. */
export function indexByEntity<T>(entries: Iterable<T>, entityId: (entry: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const entry of entries) {
    const id = entityId(entry);
    if (!id) continue;
    const targets = index.get(id);
    if (targets) targets.push(entry); else index.set(id, [entry]);
  }
  return index;
}
