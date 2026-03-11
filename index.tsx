import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { initCapacitor } from './utils/capacitorInit';
import { recoverDurableStorage } from './services/persistence';

// Boot native integrations (no-op on web/PWA)
initCapacitor();

// Recover any localStorage keys purged by iOS before the React tree reads them.
// Fire-and-forget — if it fails the app still works, just without the recovered cache.
recoverDurableStorage().catch(() => {}).finally(() => {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
});
