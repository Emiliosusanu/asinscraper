import React from 'react';
import { Calendar, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const fmtEUR = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const monthLabelIT = (y, m) => new Date(y, m, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
const pad2 = (n) => String(n).padStart(2, '0');
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const monthKeyFromDateString = (s) => String(s).slice(0,7); // expects 'YYYY-MM-DD'

function computePayoutForMonth(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  let payoutDate = new Date(year, month, Math.min(29, lastDay));
  const wd = payoutDate.getDay();
  if (wd === 6) payoutDate.setDate(payoutDate.getDate() + 2);
  else if (wd === 0) payoutDate.setDate(payoutDate.getDate() + 1);
  return payoutDate;
}

function computeThreePayouts(baseDate = new Date()) {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  // offsets 0(this month), 1(next), 2(next+1)
  const items = [0,1,2].map(off => {
    const payoutMonth = new Date(y, m + off, 1);
    const payoutDate = computePayoutForMonth(payoutMonth.getFullYear(), payoutMonth.getMonth());
    const target = new Date(y, m - 2 + off, 1); // paid month
    const from = new Date(target.getFullYear(), target.getMonth(), 1);
    const to = new Date(target.getFullYear(), target.getMonth() + 1, 1);
    return { off, payoutDate, target, from, to };
  });
  return items;
}

const PayoutWidget = () => {
  const { user } = useAuth();
  const [rows, setRows] = React.useState([]); // [{ key, payoutDate, target, totalEUR, count }]
  const [showDetails, setShowDetails] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const schedules = React.useMemo(() => computeThreePayouts(new Date()), []);
  const [fxInfo, setFxInfo] = React.useState({}); // { '2025-08': { used: { USD: 0.92, GBP: 1.17 }, note: '...' } }

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      // format as YYYY-MM-DD without timezone shifts
      const fromISO = fmtYMD(schedules[0].from);
      const toISO = fmtYMD(schedules[2].to);
      const { data, error } = await supabase
        .from('kdp_entries')
        .select('date,income,income_currency')
        .eq('user_id', user.id)
        .gte('date', fromISO)
        .lt('date', toISO);
      if (error) throw error;
      // group by YYYY-MM with counts and per-currency totals
      const byMonth = (data || []).reduce((acc, r) => {
        const k = monthKeyFromDateString(r.date);
        const v = (parseFloat(r.income || 0) || 0);
        const cur = String(r.income_currency || 'EUR').trim().toUpperCase();
        if (!acc[k]) acc[k] = { count: 0, totalsByCur: {} };
        acc[k].count += 1;
        acc[k].totalsByCur[cur] = (acc[k].totalsByCur[cur] || 0) + v;
        return acc;
      }, {});
      // currencies present across window (to limit FX queries)
      const allCurrencies = Array.from(new Set(Object.values(byMonth).flatMap(m => Object.keys(m.totalsByCur || {})))).filter(c => c && c !== 'EUR' && c !== '€');

      // Fetch monthly average FX rates (EUR base) and convert non-EUR to EUR per month
      const monthFx = {}; // key -> { cur: avgRate }
      for (const s of schedules) {
        const mKey = `${s.target.getFullYear()}-${pad2(s.target.getMonth()+1)}`;
        monthFx[mKey] = {};
        if (allCurrencies.length > 0) {
          try {
            const start = fmtYMD(s.from);
            const end = fmtYMD(new Date(s.to.getFullYear(), s.to.getMonth(), s.to.getDate()-1)); // inclusive last day of month
            const symbols = allCurrencies.join(',');
            const baseUrl = import.meta.env.PROD ? '/api/fx-timeseries' : 'https://api.exchangerate.host/timeseries';
            const params = new URLSearchParams({ base: 'EUR', start_date: start, end_date: end, symbols });
            let res = await fetch(`${baseUrl}?${params.toString()}`);
            if (!res.ok && import.meta.env.PROD) {
              // Fallback to direct API if serverless proxy fails
              res = await fetch(`https://api.exchangerate.host/timeseries?${params.toString()}`);
            }
            const json = await res.json();
            if (json && json.rates) {
              const sums = {}; const counts = {};
              Object.values(json.rates).forEach(dayObj => {
                allCurrencies.forEach(cur => {
                  const r = dayObj[cur];
                  if (typeof r === 'number' && r > 0) {
                    sums[cur] = (sums[cur] || 0) + r;
                    counts[cur] = (counts[cur] || 0) + 1;
                  }
                });
              });
              allCurrencies.forEach(cur => {
                if (counts[cur] > 0) monthFx[mKey][cur] = sums[cur] / counts[cur];
              });
            }
          } catch (e) {
            // FX unavailable; leave empty
          }
        }
      }

      const rows = schedules.map(s => {
        const k = `${s.target.getFullYear()}-${pad2(s.target.getMonth()+1)}`;
        const totalsByCur = byMonth[k]?.totalsByCur || {};
        const baseEUR = totalsByCur['EUR'] || totalsByCur['€'] || 0;
        const other = Object.entries(totalsByCur).filter(([c]) => c !== 'EUR' && c !== '€');
        // Convert other currencies to EUR using avg monthly FX (EUR base: 1 EUR = rate[c] units of c)
        let convertedEUR = baseEUR;
        const used = {};
        for (const [cur, amt] of other) {
          const rate = monthFx[k]?.[cur];
          if (rate && rate > 0) {
            convertedEUR += amt / rate; // currency -> EUR
            used[cur] = rate;
          }
        }
        return {
          key: k,
          payoutDate: s.payoutDate,
          target: s.target,
          totalEUR: convertedEUR,
          count: (byMonth[k]?.count || 0),
          otherCurrencies: other,
        };
      });
      setRows(rows);
      setFxInfo(Object.fromEntries(rows.map(r => [r.key, { used: monthFx[r.key] || {} }] )));
      try {
        localStorage.setItem('payoutWidgetRows', JSON.stringify(rows));
        window.dispatchEvent(new Event('payoutWidgetRowsUpdated'));
      } catch (_) {}
    } catch (e) {
      console.error('Failed to load payout total', e);
      setError('Impossibile caricare il totale.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, schedules.map(s => s.from.toISOString()+s.to.toISOString()).join('|')]);

  React.useEffect(() => { load(); }, [load]);

  const headerLbl = schedules[0].payoutDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const daysTo = (d) => {
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.ceil((b - a) / 86400000);
    if (diff < 0) return `passato da ${Math.abs(diff)}g`;
    if (diff === 0) return 'oggi';
    return `mancano ${diff}g`;
  };

  return (
    <div className="glass-card border border-border p-5 mt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="text-foreground font-semibold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-400">Prossimi pagamenti Amazon</span>
              <span className="text-foreground/80">• da {headerLbl}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">Valuta mostrata: EUR (altre valute convertite in EUR con media mensile)</p>
          </div>
        </div>
        <div className="flex items-center gap-2" />
      </div>
      {/* Current month progress and unpaid pipeline */}
      {(() => {
        const now = new Date();
        const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const day = now.getDate();
        const pct = Math.max(0, Math.min(100, Math.round((day / totalDays) * 100)));
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const prev1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prev1Key = `${prev1.getFullYear()}-${String(prev1.getMonth()+1).padStart(2,'0')}`;
        const prev2 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const prev2Key = `${prev2.getFullYear()}-${String(prev2.getMonth()+1).padStart(2,'0')}`;
        const payoutThisMonth = computePayoutForMonth(now.getFullYear(), now.getMonth());
        const includePrev2 = now < payoutThisMonth; // before payout, prev2 not yet paid
        const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
        const unpaidKeys = [thisMonthKey, prev1Key, ...(includePrev2 ? [prev2Key] : [])];
        const pipelineTotal = unpaidKeys.reduce((acc, k) => acc + (byKey[k]?.totalEUR || 0), 0);
        return (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Mese corrente • {monthLabelIT(now.getFullYear(), now.getMonth())}</span>
              <span>{day}/{totalDays} • {pct}%</span>
            </div>
            <div className="h-2 mt-1 rounded-full bg-slate-700/70 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-sm text-foreground/90">
              Totale non ancora pagato (EUR): <span className="text-emerald-300 font-semibold">{fmtEUR(pipelineTotal)}</span>
              <span className="text-[11px] text-muted-foreground ml-2">({unpaidKeys.join(' • ')})</span>
            </div>
          </div>
        );
      })()}
      {/* Three upcoming payout cycles */}
      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-muted-foreground">Intervallo analizzato: {fmtYMD(schedules[0].from)} → {fmtYMD(schedules[2].to)}</div>
        <button type="button" className="text-xs px-2 py-1 rounded-md text-foreground/80 hover:bg-slate-800 border border-white/10" onClick={() => setShowDetails(v => !v)}>{showDetails ? 'Nascondi dettagli' : 'Dettagli'}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
        {rows.map((r, idx) => {
          const payoutLbl = r.payoutDate.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
          const targetLbl = monthLabelIT(r.target.getFullYear(), r.target.getMonth());
          const d2 = daysTo(r.payoutDate);
          return (
            <div key={r.key} className="relative rounded-xl p-3 bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-white/10 shadow-inner">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-emerald-500/0" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-400">Pagamento</p>
                  <p className="text-sm text-gray-200 font-semibold">{payoutLbl} <span className="text-[11px] text-emerald-400 ml-1">({d2})</span></p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Mese pagato</p>
              <p className="text-sm text-gray-200 font-medium">{targetLbl}</p>
              <p className="text-[11px] text-gray-400 mt-1">Totale (EUR)</p>
              <p className="text-emerald-300 font-semibold">{fmtEUR(r.totalEUR)}</p>
              {showDetails && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[11px] text-gray-500">Voci conteggiate: {r.count}</p>
                  {Array.isArray(r.otherCurrencies) && r.otherCurrencies.length > 0 && (
                    <p className="text-[11px] text-amber-400">Altre valute (somma convertita in EUR): {r.otherCurrencies.map(([c, v]) => `${c} ${v.toFixed(2)}`).join(' • ')}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default PayoutWidget;
