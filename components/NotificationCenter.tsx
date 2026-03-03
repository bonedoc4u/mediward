import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Bell, X, CheckCheck, AlertTriangle, Droplet, ClipboardCheck, Activity, Info } from 'lucide-react';

const NotificationCenter: React.FC = () => {
  const { notifications, unreadCount, markNotificationRead, markAllRead, navigateTo } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'lab': return <Droplet className="w-4 h-4" />;
      case 'pac': return <AlertTriangle className="w-4 h-4" />;
      case 'todo': return <ClipboardCheck className="w-4 h-4" />;
      case 'pod': return <Activity className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500 bg-red-50/50';
      case 'medium': return 'border-l-orange-400 bg-orange-50/30';
      case 'low': return 'border-l-blue-400 bg-blue-50/30';
      default: return 'border-l-slate-300 bg-slate-50/30';
    }
  };

  const handleNotificationClick = (n: typeof notifications[0]) => {
    markNotificationRead(n.id);
    if (n.patientId) {
      navigateTo('patient', { id: n.patientId });
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-white/80 rounded-xl transition-all glass-effect relative"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="fixed right-2 w-[calc(100vw-16px)] max-w-96 max-h-[70vh] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden" style={{ top: 'calc(var(--safe-area-top, env(safe-area-inset-top, 0px)) + 60px)' }}>
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Notifications</h3>
                <p className="text-xs text-slate-500">{unreadCount} unread</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">All clear! No alerts right now.</p>
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left p-3 border-b border-slate-50 border-l-4 hover:bg-slate-50 transition-colors ${getPriorityColor(n.priority)} ${n.read ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 ${n.priority === 'high' ? 'text-red-500' : n.priority === 'medium' ? 'text-orange-500' : 'text-blue-500'}`}>
                        {getCategoryIcon(n.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${n.read ? 'text-slate-500' : 'text-slate-800 font-semibold'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </div>
                      {!n.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0"></div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;
