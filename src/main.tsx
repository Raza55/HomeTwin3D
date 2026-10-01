import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { startSharedInstallation, watchSharedUpdates } from './services/sharedStore';
import './App.css';
import './kiosk.css';

// Shared assets and lazy chunks can take a moment on the first visit.
const root = document.getElementById('root')!;
root.innerHTML = '<div class="app-loading" role="status">HomeTwin3D …</div>';

// Take the newest shared installation (config, model, objects, installation
// values) before the app reads its local copies; offline or without a server
// this returns quickly. The app is imported afterwards: its modules read the
// installation's entity IDs when they load.
void startSharedInstallation().finally(async () => {
  const { default: App } = await import('./App');
  createRoot(root).render(
    <StrictMode>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </HashRouter>
    </StrictMode>,
  );
  watchSharedUpdates();
});

if (import.meta.env.PROD) {
  // Auto-update the installed app when a new production version is available.
  registerSW({ immediate: true });
} else if ('serviceWorker' in navigator) {
  // A previously installed production worker can otherwise serve stale UI during development.
  const appScope = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    const matching = registrations.filter((registration) => registration.scope.startsWith(appScope));
    if (!matching.length) return;
    const wasControlled = navigator.serviceWorker.controller !== null;
    const results = await Promise.all(matching.map((registration) => registration.unregister()));
    if (wasControlled && results.some(Boolean) && !sessionStorage.getItem('dev-service-worker-cleared')) {
      sessionStorage.setItem('dev-service-worker-cleared', 'true');
      window.location.reload();
    }
  });
}
