import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

// Feature flag
const enabled = import.meta.env.VITE_NOTIFICATIONS_V1 === '1' || import.meta.env.VITE_NOTIFICATIONS_V1 === 'true';

export type NotificationItem = {
  id: string;
  asin: string;
  user_id: string;
  status: 'better' | 'worse' | 'stable';
  net_impact: number;
  sentiment: string;
  drivers: string[];
  confidence: 'high' | 'medium' | 'low';
  details: any;
  created_at: string;
};

export type NotificationsSummary = {
  counts: { better: number; worse: number; stable: number };
  netImpactAvg: number;
  windowDays: number;
  asOf?: string | null;
  sentiment?: string;
  mode?: string;
};

// Context to open/close from anywhere
const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export const useSmartNotifications = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSmartNotifications must be used within SmartNotificationsProvider');
  return ctx;
};

export const SmartNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  // global event to open from anywhere
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('openSmartNotifications', onOpen as EventListener);
    return () => window.removeEventListener('openSmartNotifications', onOpen as EventListener);
  }, []);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithAuth(path: string): Promise<Response> {
  const headers = await authHeaders();
  return fetch(path, { headers });
}

const Pill: React.FC<{ tone: 'emerald' | 'red' | 'slate'; label: string; value: string | number }>
  = ({ tone, label, value }) => (
  <div className={`rounded-lg border p-2 text-xs ${tone === 'emerald' ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-300' : tone === 'red' ? 'bg-red-600/10 border-red-500/30 text-red-300' : 'bg-slate-700/40 border-slate-600 text-gray-200'}`}>
    <div className="text-[10px] opacity-80">{label}</div>
    <div className="font-semibold text-sm">{value}</div>
  </div>
);

const TopDrivers: React.FC<{ items: NotificationItem[] }> = ({ items }) => {
  const freq = new Map<string, number>();
  for (const it of items) {
    for (const d of (it.drivers || [])) {
      freq.set(d, (freq.get(d) || 0) + 1);
    }
  }
  const top = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
      <span className="opacity-80">Driver principali</span>
      {top.map(([label, count]) => (
        <span key={label} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-gray-100 border border-slate-600">
          {label} ×{count}
        </span>
      ))}
    </div>
  );
};

export const SmartNotificationsDrawer: React.FC = () => {
  const { user } = useAuth();
  const { open, setOpen } = useSmartNotifications();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<NotificationsSummary | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [learning, setLearning] = useState<any>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const sRes = await fetchWithAuth('/api/notifications-summary?mode=latest');
      const sJson = await sRes.json();
      if (!sRes.ok) throw new Error(sJson?.error || 'Summary error');
      setSummary(sJson);

      const iRes = await fetchWithAuth('/api/notifications?limit=100');
      const iJson = await iRes.json();
      if (!iRes.ok) throw new Error(iJson?.error || 'Items error');
      setItems(iJson.items || []);
    } catch (e: any) {
      setError(e?.message || 'Errore nel caricare le notifiche');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  // Load lightweight learning data from localStorage and keep in sync
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('notifLearningV1');
        setLearning(raw ? JSON.parse(raw) : {});
      } catch (_) { setLearning({}); }
    };
    load();
    const onUpd = () => load();
    window.addEventListener('notifLearningUpdated', onUpd as EventListener);
    return () => window.removeEventListener('notifLearningUpdated', onUpd as EventListener);
  }, []);

  // Compute a relevance score per item using user feedback (drivers/asin/kind) + confidence
  const rankedItems = useMemo(() => {
    const L = learning || {};
    const diff = (pos?: number, neg?: number) => (Number(pos||0) - 1.2 * Number(neg||0));
    const confW = (c?: 'high'|'medium'|'low') => c === 'high' ? 1 : c === 'medium' ? 0.7 : 0.5;
    const arr = (items || []).map((n) => {
      let s = 0;
      // driver contributions
      for (const d of (n.drivers || [])) {
        const stats = L?.driver?.[String(d)] || { pos: 0, neg: 0 };
        s += diff(stats.pos, stats.neg) * 10;
      }
      // asin contribution
      if (n.asin) {
        const a = L?.asin?.[String(n.asin)] || { pos: 0, neg: 0 };
        s += diff(a.pos, a.neg) * 8;
      }
      // kind/status contribution
      if (n.status) {
        const k = L?.kind?.[String(n.status)] || { pos: 0, neg: 0 };
        s += diff(k.pos, k.neg) * 6;
      }
      // confidence weight
      s *= confW(n.confidence);
      // small nudge for positive net impact if present
      const imp = Number.isFinite(n.net_impact) ? Number(n.net_impact) : 0;
      s += Math.max(-10, Math.min(10, imp)) * 0.5; // clamp +/-10%
      // normalize to 0..100 around a 50 baseline
      const score = Math.max(0, Math.min(100, Math.round(50 + s)));
      const recommended = score >= 70;
      return { ...n, _score: score, _recommended: recommended } as NotificationItem & { _score: number; _recommended: boolean };
    });
    return arr.sort((a, b) => (Number(b._recommended) - Number(a._recommended)) || (b._score - a._score) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  }, [items, learning]);

  const markHelpful = async (n: NotificationItem, sign: 'positive' | 'negative' = 'positive') => {
    try {
      const headers = await authHeaders();
      headers['Content-Type'] = 'application/json';
      const r = await fetch('/api/notifications-feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ notification_id: n.id, asin: n.asin, action: 'helpful', driverSign: sign }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.warn('feedback error', t);
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem('notifLearningV1');
      const L: any = raw ? JSON.parse(raw) : {};
      const inc = (obj: any, k: string, key: 'pos' | 'neg') => {
        if (!k) return;
        obj[k] = obj[k] || { pos: 0, neg: 0 };
        obj[k][key] = Number(obj[k][key] || 0) + 1;
      };
      const key: 'pos' | 'neg' = sign === 'negative' ? 'neg' : 'pos';
      L.driver = L.driver || {};
      for (const d of (n.drivers || [])) inc(L.driver, String(d), key);
      L.asin = L.asin || {};
      inc(L.asin, String(n.asin || ''), key);
      L.kind = L.kind || {};
      inc(L.kind, String(n.status || ''), key);
      localStorage.setItem('notifLearningV1', JSON.stringify(L));
      try { window.dispatchEvent(new Event('notifLearningUpdated')); } catch (_) {}
    } catch (_) {}
  };

  if (!enabled) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="fixed right-0 top-0 bottom-0 h-full w-[96vw] sm:w-[540px] max-w-[540px] translate-x-0 translate-y-0 rounded-none border-l border-slate-700 bg-slate-900 text-white p-0">
        <div className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Notifiche Intelligenti</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="border-slate-600 text-gray-200 hover:bg-slate-800" onClick={loadAll} disabled={loading}>Ricarica</Button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <Pill tone="emerald" label="Better" value={summary ? summary.counts.better : '—'} />
            <Pill tone="red" label="Worse" value={summary ? summary.counts.worse : '—'} />
            <Pill tone="slate" label="Stable" value={summary ? summary.counts.stable : '—'} />
            <Pill tone={summary && summary.netImpactAvg >= 0 ? 'emerald' : 'red'} label="Net Impact" value={summary ? `${summary.netImpactAvg.toFixed(1)}%` : '—'} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <span className="opacity-80">Sentiment:</span>
              <span className="font-medium">{summary?.sentiment || '—'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="opacity-80">Aggiornato</span>
              <span className="font-medium">{summary?.asOf ? new Date(summary.asOf).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '—'}</span>
              <span className="opacity-80">Elementi</span>
              <span className="font-medium">{items.length}</span>
            </div>
          </div>
          <TopDrivers items={items} />
        </div>
        <div className="p-3 space-y-3 overflow-y-auto h-full">
          {error && <div className="text-sm text-red-300">{error}</div>}
          {loading && <div className="text-sm text-gray-300">Caricamento...</div>}
          {!loading && rankedItems.length === 0 && (
            <div className="text-sm text-gray-400">Nessun peggioramento recente.</div>
          )}
          {rankedItems.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-700 bg-slate-800 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-200 truncate mr-2 flex items-center gap-2">
                  <span>{n.asin}</span>
                  {n._recommended && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">Consigliato</span>
                  )}
                  {n.details?.prev?.samples === 0 && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">Nuovo</span>
                  )}
                </div>
                <div className={`text-xs px-2 py-0.5 rounded ${n.status==='better'?'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30':n.status==='worse'?'bg-red-600/20 text-red-300 border border-red-500/30':'bg-slate-700 text-gray-200 border border-slate-600'}`}>{n.sentiment}</div>
              </div>
              <div className="mt-1 text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(n.drivers||[]).slice(0,5).map((d, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700 text-gray-100 border border-slate-600">{d}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/60 border border-slate-700 rounded p-2">
                  <div className="text-[11px] text-gray-400">Royalty media (stima)</div>
                  <div>Prec: {n.details?.prev?.avgRoyalty != null ? Number(n.details.prev.avgRoyalty).toFixed(2) : '—'}</div>
                  <div>Curr: {n.details?.curr?.avgRoyalty != null ? Number(n.details.curr.avgRoyalty).toFixed(2) : '—'}</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded p-2">
                  <div className="text-[11px] text-gray-400">BSR medio / Prezzo medio</div>
                  <div>{(n.details?.prev?.avgBsr || 0)} → {(n.details?.curr?.avgBsr || 0)}</div>
                  <div>${(n.details?.prev?.avgPrice ?? 0).toFixed(2)} → ${(n.details?.curr?.avgPrice ?? 0).toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-gray-400">Copertura: {n.details?.coverageDays || 0} giorni • Campioni: prev {n.details?.prev?.samples || 0}, curr {n.details?.curr?.samples || 0}</div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className="text-[11px] text-gray-400">Score {Number((n as any)._score ?? 0)}</span>
                <Button size="sm" variant="outline" className="border-slate-600 text-gray-200 hover:bg-slate-800" onClick={() => markHelpful(n, 'positive')}>Utile</Button>
                <Button size="sm" variant="outline" className="border-slate-600 text-gray-200 hover:bg-slate-800" onClick={() => markHelpful(n, 'negative')}>Non utile</Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const SmartNotificationsFab: React.FC = () => {
  const { setOpen } = useSmartNotifications();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed right-4 bottom-36 lg:bottom-20 z-50 rounded-full bg-slate-800 border border-slate-700 text-gray-100 shadow-lg px-3 py-2 text-sm hover:bg-slate-700"
      title="Apri Notifiche Intelligenti"
    >
      Notifiche
    </button>
  );
};
