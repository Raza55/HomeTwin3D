import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  </StrictMode>,
);

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
