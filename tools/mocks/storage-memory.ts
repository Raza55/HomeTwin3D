// In-memory stand-in for src/services/storageApi (IndexedDB) in Node tests.
// Each simulated browser swaps globalThis.__hometwinAssets.
const assets = () => (globalThis as { __hometwinAssets?: Map<string, Blob> }).__hometwinAssets!;
export async function saveModel(blob: Blob): Promise<void> { assets().set('model', blob); }
export async function getModel(): Promise<Blob | null> { return assets().get('model') ?? null; }
export async function deleteModel(): Promise<void> { assets().delete('model'); }
export async function saveObjectAsset(id: string, blob: Blob): Promise<void> { assets().set(`object:${id}`, blob); }
export async function getObjectAsset(id: string): Promise<Blob | null> { return assets().get(`object:${id}`) ?? null; }
export async function deleteObjectAsset(id: string): Promise<void> { assets().delete(`object:${id}`); }
export async function deleteObjectAssets(ids: string[]): Promise<void> { for (const id of ids) assets().delete(`object:${id}`); }
export async function replaceAssets(changes: { model?: Blob | null; objects: Map<string, Blob>; deleted: string[] }): Promise<void> {
  if (changes.model !== undefined) {
    if (changes.model === null) assets().delete('model'); else assets().set('model', changes.model);
  }
  for (const id of changes.deleted) assets().delete(`object:${id}`);
  for (const [id, blob] of changes.objects) assets().set(`object:${id}`, blob);
}
