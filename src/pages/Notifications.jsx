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
  const bootRef = React.useRef(false);

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

  // --- Client-side bootstrap: compute snapshots -> ensure rule -> generate events (self only) ---
  const toDateKey = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const opCompare = (a, op, b) => {
    if (a == null || !Number.isFinite(a)) return false;
    switch (op) {
      case 'lt': return a < b;
      case 'lte': return a <= b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'eq': return a === b;
      case 'neq': return a !== b;
      default: return false;
    }
  };

  const evalCondition = (snap, cond) => {
    if (!cond || typeof cond !== 'object') return false;
    if (Array.isArray(cond.all)) return cond.all.every((c) => evalCondition(snap, c));
    if (Array.isArray(cond.any)) return cond.any.some((c) => evalCondition(snap, c));
    const metric = String(cond.metric || '');
    const op = String(cond.op || '');
    const value = Number(cond.value);
    if (!metric || !op || !Number.isFinite(value)) return false;
    const a = snap[metric];
    return opCompare(typeof a === 'string' ? Number(a) : a, op, value);
  };

  async function sha256Hex(text) {
    try {
      const enc = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback: weak hash
      let h = 0; for (let i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) | 0; }
      return String(h);
    }
  }

  const computeSnapshotsIfMissing = React.useCallback(async () => {
    if (!user) return false;
    const todayKey = toDateKey(new Date());
    // Check if we already have snapshots for today
    const { data: existing } = await supabase
      .from('performance_snapshots')
      .select('id')
      .eq('user_id', user.id)
      .eq('day', todayKey)
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) return true;

    // Load user's ASINs
    const { data: asins } = await supabase
      .from('asin_data')
      .select('id, asin, country')
      .eq('user_id', user.id);
    if (!Array.isArray(asins) || asins.length === 0) return false;

    for (const row of asins) {
      const asinId = row.id;
      const since = new Date(); since.setUTCDate(since.getUTCDate() - 60);
      const { data: hist, error: histErr } = await supabase
        .from('asin_history')
        .select('created_at, bsr, price, review_count, rating, availability')
        .eq('user_id', user.id)
        .eq('asin_data_id', asinId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });
      if (histErr) continue;

      const byDay = new Map();
      for (const h of (hist || [])) {
        const dkey = toDateKey(h.created_at);
        const prev = byDay.get(dkey);
        if (!prev || new Date(h.created_at) > new Date(prev.created_at)) byDay.set(dkey, h);
      }
      const days = Array.from(byDay.keys()).sort();

      // Compute metrics like Edge function
      const bsr30 = days.slice(-30).map((d) => Number(byDay.get(d)?.bsr)).filter((v) => Number.isFinite(v) && v > 0);
      const allBsr = days.map((d) => Number(byDay.get(d)?.bsr)).filter((v) => Number.isFinite(v) && v > 0);
      const price30 = days.slice(-30).map((d) => Number(byDay.get(d)?.price)).filter((v) => Number.isFinite(v) && v > 0);

      const minEver = allBsr.length ? Math.min(...allBsr) : null;
      const maxEver = allBsr.length ? Math.max(...allBsr) : null;
      const curr = allBsr.length ? allBsr[allBsr.length - 1] : null;
      let qi = null;
      if (minEver != null && maxEver != null && curr != null && maxEver > minEver) {
        const r = (maxEver - curr) / (maxEver - minEver);
        qi = Math.round(Math.max(0, Math.min(1, r)) * 100);
      }
      let vol30 = null, mom7 = null, elasticity = null, pct = null;
      if (bsr30.length >= 5) {
        const bMin = Math.min(...bsr30); const bMax = Math.max(...bsr30);
        const norm = bsr30.map((v) => (bMax > bMin ? (v - bMin) / (bMax - bMin) : 0.5));
        // stddev
        const mean = norm.reduce((a, b) => a + b, 0) / norm.length;
        const v = norm.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / norm.length;
        vol30 = Number(Math.sqrt(v).toFixed(4));
        const window = norm.slice(-7);
        if (window.length >= 2) {
          const xs = Array.from({ length: window.length }, (_, i) => i);
          const n = window.length;
          const sumX = xs.reduce((a, b) => a + b, 0);
          const sumY = window.reduce((a, b) => a + b, 0);
          const sumXY = xs.reduce((acc, xi, i) => acc + xi * window[i], 0);
          const sumXX = xs.reduce((acc, xi) => acc + xi * xi, 0);
          const denom = n * sumXX - sumX * sumX;
          const slope = denom === 0 ? null : (n * sumXY - sumX * sumY) / denom;
          mom7 = slope != null ? Number(slope.toFixed(4)) : null;
        }
        if (norm.length > 1) {
          const currN = norm[norm.length - 1];
          pct = Number((1 - currN).toFixed(4));
        }
      }

      await supabase
        .from('performance_snapshots')
        .upsert([
          {
            user_id: user.id,
            asin_data_id: asinId,
            asin: row.asin,
            country: row.country || 'com',
            day: todayKey,
            qi_score: qi,
            baseline_percentile: pct,
            volatility_30: vol30,
            momentum_7: mom7,
            elasticity_est: elasticity,
            notes: null,
          }
        ], { onConflict: 'asin_data_id, day' });
    }
    return true;
  }, [user?.id]);

  const ensureDefaultRule = React.useCallback(async () => {
    if (!user) return false;
    // Ensure tip exists
    await supabase
      .from('tips_library')
      .upsert([
        {
          code: 'low_qi_recovery',
          title: 'Recover your best historical performance',
          body_md: 'QI is well below your historical best.\n\nTry: review cover/keywords; check for stock issues; consider small promo to regain rank.',
          metric_keys: ['qi_score','baseline_percentile'],
          severity: 'info',
        }
      ], { onConflict: 'code' });

    const { data: rules } = await supabase
      .from('notification_rules')
      .select('id')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .limit(1);
    if (Array.isArray(rules) && rules.length > 0) return true;

    const cond = { all: [ { metric: 'qi_score', op: 'lt', value: 40 }, { metric: 'momentum_7', op: 'gt', value: 0.02 }, { tip_code: 'low_qi_recovery' } ] };
    const { error } = await supabase
      .from('notification_rules')
      .insert({ user_id: user.id, name: 'Low QI + Losing momentum', rule_type: 'threshold', condition: cond, cooloff_seconds: 21600, channels: ['inapp'], enabled: true });
    return !error;
  }, [user?.id]);

  const generateEventsForUser = React.useCallback(async () => {
    if (!user) return false;
    const dayKey = toDateKey(new Date());
    const { data: rules } = await supabase
      .from('notification_rules')
      .select('id, name, condition, cooloff_seconds, channels, enabled')
      .eq('user_id', user.id)
      .eq('enabled', true);
    if (!Array.isArray(rules) || rules.length === 0) return false;

    const { data: snaps } = await supabase
      .from('performance_snapshots')
      .select('id, asin_data_id, asin, country, day, qi_score, baseline_percentile, volatility_30, momentum_7, elasticity_est')
      .eq('user_id', user.id)
      .eq('day', dayKey);

    let created = 0;
    for (const rule of (rules || [])) {
      const cond = (rule && rule.condition) || {};
      const cooloffSec = Number(rule.cooloff_seconds || 21600);
      const channels = Array.isArray(rule.channels) ? rule.channels : ['inapp'];
      for (const snap of (snaps || [])) {
        if (!evalCondition(snap, cond)) continue;
        const keySig = JSON.stringify({ rule: rule.id, asin: snap.asin_data_id, cond });
        const dedupeKey = await sha256Hex(keySig);
        const sinceIso = new Date(Date.now() - cooloffSec * 1000).toISOString();
        const { data: recent } = await supabase
          .from('notification_events')
          .select('id')
          .eq('user_id', user.id)
          .eq('dedupe_key', dedupeKey)
          .gte('created_at', sinceIso)
          .limit(1);
        if (recent && recent.length) continue;

        const severity = 'info';
        const title = rule.name || 'Performance update';
        const md = `ASIN: ${snap.asin}\nCountry: ${snap.country}\n\nMetrics (today):\n- QI: ${snap.qi_score ?? '—'}\n- Momentum(7): ${snap.momentum_7 ?? '—'}\n- Volatility(30): ${snap.volatility_30 ?? '—'}\n- Baseline pct: ${snap.baseline_percentile ?? '—'}\n- Elasticity est: ${snap.elasticity_est ?? '—'}`;
        for (const ch of channels) {
          await supabase.from('notification_events').insert({
            user_id: user.id,
            asin_data_id: snap.asin_data_id,
            rule_id: rule.id,
            severity,
            title,
            body_md: md,
            channel: ch,
            dedupe_key: dedupeKey,
            status: 'queued',
          });
          created++;
        }
      }
    }
    return created > 0;
  }, [user?.id]);

  React.useEffect(() => {
    const bootstrap = async () => {
      if (!user || bootRef.current) return;
      bootRef.current = true;
      try {
        await computeSnapshotsIfMissing();
        await ensureDefaultRule();
        const made = await generateEventsForUser();
        if (made) await load();
      } catch (_) {
        // silent bootstrap
      }
    };
    bootstrap();
  }, [user?.id, computeSnapshotsIfMissing, ensureDefaultRule, generateEventsForUser, load]);

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
