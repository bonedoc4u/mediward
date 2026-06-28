import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { initCapacitor } from './utils/capacitorInit';
import { recoverDurableStorage } from './services/persistence';
import { initSyncQueue } from './services/syncQueue';
import { startConnectivityPolling } from './utils/connectivity';
import { toast } from './utils/toast';

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

// Listen for the BackgroundSync service worker notifying us that queued round
// notes have been replayed. Chrome/Android only — iOS falls back to syncQueue.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'ROUNDS_SYNCED') {
      const n = e.data.count as number;
      toast.success(`${n} round note${n > 1 ? 's' : ''} synced`);
    }
  });
}

// Recover any localStorage keys purged by iOS and initialise the offline sync
// queue from Capacitor Preferences (UserDefaults — survives iOS memory pressure).
// Both must complete before the React tree mounts so enqueue() sees a warm cache.
Promise.all([
  recoverDurableStorage(),
  initSyncQueue(),
]).catch(() => {}).finally(() => {
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
