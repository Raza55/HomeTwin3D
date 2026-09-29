// Private LAN build for `vite preview` (never for public artifacts): personal
// installation defaults, and the Home Assistant WebSocket through the preview
// server's same-origin proxy so the page can run over HTTPS (WebGPU in Safari).
import { execSync } from 'node:child_process';

execSync('npx vite build --outDir .private/dist-lan --emptyOutDir', {
  stdio: 'inherit',
  env: { ...process.env, HOMETWIN_PRIVATE_BUILD: '1', VITE_HA_WS_PROXY: '1' },
});
