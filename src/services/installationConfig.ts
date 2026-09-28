/** Optional local defaults. Public builds and Node tests use anonymous examples. */
export interface InstallationConfig {
  entities?: Record<string, string>;
  location?: { label: string; latitude: number; longitude: number };
  mediaProxyTarget?: string;
}
declare const __HOMETWIN_INSTALLATION__: InstallationConfig;
export const installation: InstallationConfig = typeof __HOMETWIN_INSTALLATION__ === 'undefined' ? {} : __HOMETWIN_INSTALLATION__;
export function installationEntity(example: string): string {
  return installation.entities?.[example] ?? example;
}
