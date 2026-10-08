/** Private calendar pictures live in their own database, outside shared model exports. */
async function openPictures(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hometwin-calendar-pictures', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('months');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function monthPicture(month: number, change?: Blob | null): Promise<Blob | null> {
  const db = await openPictures();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('months', change === undefined ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('months');
    let result: Blob | null = null;
    if (change === undefined) {
      const request = store.get(month);
      request.onsuccess = () => { result = request.result ?? null; };
    } else if (change === null) store.delete(month);
    else { store.put(change, month); result = change; }
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Picture storage failed')); };
  });
}

/** Decode before saving; bound storage and strip original photo metadata. */
export async function prepareMonthPicture(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error('Invalid picture');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Image processing failed')), 'image/webp', 0.88,
    ));
  } finally { URL.revokeObjectURL(url); }
}
