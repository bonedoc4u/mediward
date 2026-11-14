import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { initCapacitor } from './utils/capacitorInit';
import { recoverDurableStorage } from './services/persistence';
import { initSyncQueue } from './services/syncQueue';
import { startConnectivityPolling } from './utils/connectivity';
import { startLegacyRoundHandover } from './services/legacyRoundQueue';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: (import.meta.env.VITE_ENVIRONMENT as string) ?? 'production',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Boot native integrations (no-op on web/PWA)
initCapacitor();
// Start real connectivity probing (replaces unreliable navigator.onLine)
startConnectivityPolling();

// Recover any localStorage keys purged by iOS and initialise the offline sync
// queue from Capacitor Preferences (UserDefaults — survives iOS memory pressure).
// Both must complete before the React tree mounts so enqueue() sees a warm cache.
Promise.all([
  recoverDurableStorage(),
  initSyncQueue(),
]).catch(() => {}).finally(() => {
  // Move round saves left in the service worker's old queue into the app
  // queue (now warm). Background task — does not delay the first paint.
  startLegacyRoundHandover();

  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <Sentry.ErrorBoundary fallback={<div style={{ padding: 32, fontFamily: 'sans-serif' }}>An unexpected error occurred. Please reload the page.</div>}>
        <AppProvider>
          <App />
        </AppProvider>
      </Sentry.ErrorBoundary>
    </React.StrictMode>
  );
});
