import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, DatabaseZap } from 'lucide-react';
import { usePatients } from '../contexts/AppContext';
import { formatCacheAge } from '../services/patientCache';

const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const { isStale, cacheTimestamp } = usePatients();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3500);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Reconnected flash ───
  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 text-sm font-semibold shadow-lg bg-emerald-500 text-white transition-all duration-300">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Back online — syncing offline changes…
      </div>
    );
  }

  // ─── No connection ───
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 text-sm font-semibold shadow-lg bg-amber-500 text-white transition-all duration-300">
        <WifiOff className="w-4 h-4" />
        You&apos;re offline — showing cached data
        {cacheTimestamp && (
          <span className="opacity-75 text-xs font-normal ml-1">
            · last synced {formatCacheAge(cacheTimestamp)}
          </span>
        )}
      </div>
    );
  }

  // ─── Online but serving stale cache (background fetch in progress) ───
  if (isStale && cacheTimestamp) {
    const age = formatCacheAge(cacheTimestamp);
    // Only show if cache is older than 2 minutes — avoids flash on fast connections
    const isOld = Date.now() - new Date(cacheTimestamp).getTime() > 2 * 60 * 1000;
    if (!isOld) return null;

    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-medium shadow-md bg-blue-600 text-white transition-all duration-300">
        <DatabaseZap className="w-3.5 h-3.5 animate-pulse" />
        Showing cached data from {age} · Syncing in background…
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
