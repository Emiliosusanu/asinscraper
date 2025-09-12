import React from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2, Check, Bell, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString('it-IT');
  } catch (_) {
    return ts;
  }
}

function SeverityBadge({ sev }) {
  const s = String(sev || 'info').toLowerCase();
  const map = {
    info: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    critical: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
  };
  const Icon = s === 'critical' ? AlertTriangle : s === 'warning' ? AlertTriangle : Info;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${map[s] || map.info}`}>
      <Icon className="w-3.5 h-3.5" />
      {s}
    </span>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, created_at, severity, title, body_md, channel, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) setRows(data || []);
    setLoading(false);
  }, [user?.id]);

  React.useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    if (!user) return;
    setUpdating(true);
    await supabase
      .from('notification_events')
      .update({ status: 'read' })
      .eq('user_id', user.id)
      .eq('status', 'queued');
    await load();
    setUpdating(false);
  };

  if (!user) return null;

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Bell className="w-5 h-5" /> Notifiche</h2>
        <Button size="sm" variant="outline" onClick={markAllRead} disabled={updating} className="border-border text-muted-foreground hover:bg-muted hover:text-foreground">
          {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Segna tutte come lette
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : rows?.length ? (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="glass-card border border-border/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge sev={r.severity} />
                  <span className="text-xs text-muted-foreground">{r.channel}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                  {r.status !== 'read' && <span className="text-[10px] uppercase tracking-wide text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">{r.status}</span>}
                </div>
              </div>
              <h3 className="mt-2 text-foreground font-semibold">{r.title}</h3>
              <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{r.body_md}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16">Nessuna notifica.</div>
      )}
    </div>
  );
}
