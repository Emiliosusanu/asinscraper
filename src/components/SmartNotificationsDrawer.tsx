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
          {!loading && items.length === 0 && (
            <div className="text-sm text-gray-400">Nessun peggioramento recente.</div>
          )}
          {items.map((n) => (
            <div key={n.id} className="rounded-lg border border-slate-700 bg-slate-800 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-200 truncate mr-2 flex items-center gap-2">
                  <span>{n.asin}</span>
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
                <Button size="sm" variant="outline" className="border-slate-600 text-gray-200 hover:bg-slate-800" onClick={() => markHelpful(n, 'positive')}>Utile</Button>
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
