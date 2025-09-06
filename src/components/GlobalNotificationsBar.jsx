import React from 'react';
import GlobalNotificationsBell from '@/components/GlobalNotificationsBell';

const loadPayload = () => {
  try {
    const raw = localStorage.getItem('globalNotifications');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const GlobalNotificationsBar = () => {
  const [payload, setPayload] = React.useState(() => loadPayload());
  const [ackTs, setAckTs] = React.useState(() => {
    try { return Number(localStorage.getItem('globalNotificationsAckTs')) || 0; } catch (_) { return 0; }
  });

  const hasUnread = React.useMemo(() => {
    const ts = payload?.ts || 0;
    const important = (payload?.counts?.better || 0) + (payload?.counts?.worse || 0);
    return ts > ackTs && important > 0;
  }, [payload, ackTs]);

  React.useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key === 'globalNotifications' || ev.key === 'globalNotificationsAckTs') {
        setPayload(loadPayload());
        try { setAckTs(Number(localStorage.getItem('globalNotificationsAckTs')) || 0); } catch (_) {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markAsRead = () => {
    const ts = payload?.ts || Date.now();
    try {
      localStorage.setItem('globalNotificationsAckTs', String(ts));
      setAckTs(ts);
    } catch (_) {}
  };

  if (!hasUnread) return null;

  const counts = payload?.counts || { better: 0, worse: 0, stable: 0 };
  const messages = Array.isArray(payload?.messages) ? payload.messages.slice(0, 2) : [];

  return (
    <div className="sticky top-0 z-30 -mt-4 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 pb-3 bg-gradient-to-r from-slate-900/85 via-slate-900/70 to-slate-900/85 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Better: {counts.better}</span>
            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20">Worse: {counts.worse}</span>
            <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">Stable: {counts.stable}</span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm text-gray-200 min-w-0">
            {messages.length > 0 ? messages.map((m, i) => (
              <div key={i} className="truncate max-w-[22rem] text-gray-300">• {m}</div>
            )) : (
              <div className="text-gray-400">Nuove performance rilevanti disponibili.</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalNotificationsBell />
          <button onClick={markAsRead} className="px-3 py-1.5 rounded border border-white/10 hover:border-emerald-400 text-[12px] text-gray-200">Segna come letto</button>
        </div>
      </div>
    </div>
  );
};

export default GlobalNotificationsBar;
