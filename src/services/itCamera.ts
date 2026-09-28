/** Accept only the selected HA camera's still-image endpoint, never arbitrary URLs. */
export function itCameraUrl(path: unknown, entityId: string, base: string): string | undefined {
  if (typeof path !== 'string' || !/^camera\.[a-z0-9_]+$/.test(entityId)) return;
  try {
    const origin=new URL(base),url=new URL(path,origin);
    if (!['http:','https:'].includes(url.protocol)||url.origin!==origin.origin||url.pathname!==`/api/camera_proxy/${entityId}`) return;
    return url.href;
  } catch { return; }
}
