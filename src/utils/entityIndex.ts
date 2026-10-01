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

/** A popup only needs its configured dependencies; keep the complete HA states themselves intact. */
export function selectEntityStates<T>(states: Record<string, T>, entityIds: Iterable<string>): Record<string, T> {
  const selected: Record<string, T> = {};
  for (const id of entityIds) {
    if (states[id] !== undefined) selected[id] = states[id];
  }
  return selected;
}
