import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { errorLogger } from './services/errorLogger';

import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

errorLogger.installGlobalHandlers();

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// Register the service worker for offline support (production only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      const cacheLoadedResources = () => {
        const urls = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin));
        registration.active?.postMessage({ type: 'CACHE_URLS', urls });
      };
      if (registration.active) cacheLoadedResources();
      else void navigator.serviceWorker.ready.then(cacheLoadedResources);
    }).catch(() => {
      /* offline support is a progressive enhancement */
    });
  });
}
