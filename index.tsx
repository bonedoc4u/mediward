import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { initCapacitor } from './utils/capacitorInit';
import { recoverDurableStorage } from './services/persistence';
import { initSyncQueue } from './services/syncQueue';

// Boot native integrations (no-op on web/PWA)
initCapacitor();

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
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
});
