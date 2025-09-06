import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Target, TrendingUp, AlertTriangle, BarChart2, Lightbulb, Gauge, Layers3, Focus, Waypoints, BadgePercent, Clock } from 'lucide-react';
import { estimateRoyalty } from '@/lib/royaltyEstimator';

const asPct = (n) => (n != null && isFinite(n) ? `${n.toFixed(1)}%` : '—');

const Pill = ({ children, tone = 'default' }) => {
  const tones = {
    default: 'bg-white/5 text-white',
    good: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    warn: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20',
    bad: 'bg-red-500/15 text-red-300 border border-red-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] ${tones[tone] || tones.default}`}>{children}</span>
  );
};

const AsinAcosGuideModal = ({ asinData, breakEvenAcos, isOpen, onClose }) => {
  const price = Number(asinData?.price) || 0;
  const scrapedRoyalty = Number(asinData?.royalty) || 0;
  const effectiveRoyalty = scrapedRoyalty > 0 ? scrapedRoyalty : estimateRoyalty(asinData);
  const be = breakEvenAcos != null ? breakEvenAcos : (price > 0 && effectiveRoyalty > 0 ? (effectiveRoyalty / price) * 100 : null);

  // Suggested targets derived from Break-even ACOS
  const targetMin = be != null ? Math.max(0, be * 0.60) : null; // scale/profit focus
  const targetMax = be != null ? be * 0.85 : null;              // upper bound before watch zone
  const watchHi  = be != null ? be : null;                       // loss boundary

  const asin = asinData?.asin || null;
  const countryCode = (asinData?.country || '').toLowerCase();

  // Budget planner states (10,000 USD) — declared early so effects can reference them
  const [budgetUsd, setBudgetUsd] = React.useState(10000);
  const [horizonDays, setHorizonDays] = React.useState(30);
  const [scenario, setScenario] = React.useState('bilanciato'); // conservativo | bilanciato | aggressivo
  const splitsByScenario = {
    conservativo: { sp: 0.75, sb: 0.15, sd: 0.10, spInner: { auto: 0.20, broad: 0.30, exact: 0.50 } },
    bilanciato:   { sp: 0.60, sb: 0.25, sd: 0.15, spInner: { auto: 0.30, broad: 0.30, exact: 0.40 } },
    aggressivo:   { sp: 0.50, sb: 0.30, sd: 0.20, spInner: { auto: 0.40, broad: 0.30, exact: 0.30 } },
  };
  const splits = splitsByScenario[scenario] || splitsByScenario.bilanciato;
  const dailyTotal = budgetUsd && horizonDays ? (Math.max(0, Number(budgetUsd)) / Math.max(1, Number(horizonDays))) : 0; // USD
  const spDaily = dailyTotal * splits.sp;
  const sbDaily = dailyTotal * splits.sb;
  const sdDaily = dailyTotal * splits.sd;
  const spAutoDaily  = spDaily * splits.spInner.auto;
  const spBroadDaily = spDaily * splits.spInner.broad;
  const spExactDaily = spDaily * splits.spInner.exact;

  // Calculator states (CPC/Bid)
  const tMid = (targetMin != null && targetMax != null) ? (targetMin + targetMax) / 2 : null;
  const [calcTargetAcos, setCalcTargetAcos] = React.useState(tMid ?? 30);
  const [calcPrice, setCalcPrice] = React.useState(price || 9.99);
  const [calcCvr, setCalcCvr] = React.useState(10);
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);
  const [kdpPreset, setKdpPreset] = React.useState('fiction'); // 'low' | 'fiction'
  React.useEffect(() => {
    if (prefsLoaded) return;
    setCalcPrice(price || 0);
    setCalcTargetAcos(tMid ?? 30);
  }, [price, tMid, prefsLoaded]);

  // Load preferences per ASIN
  React.useEffect(() => {
    if (!asin) { setPrefsLoaded(true); return; }
    try {
      const raw = localStorage.getItem(`acosGuidePrefs:${asin}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (p) {
          if (typeof p.calcTargetAcos === 'number') setCalcTargetAcos(p.calcTargetAcos);
          if (typeof p.calcPrice === 'number') setCalcPrice(p.calcPrice);
          if (typeof p.calcCvr === 'number') setCalcCvr(p.calcCvr);
          if (typeof p.budgetUsd === 'number') setBudgetUsd(p.budgetUsd);
          if (typeof p.horizonDays === 'number') setHorizonDays(p.horizonDays);
          if (typeof p.scenario === 'string') setScenario(p.scenario);
          if (typeof p.kdpPreset === 'string') setKdpPreset(p.kdpPreset);
        }
      }
    } catch (_) {}
    setPrefsLoaded(true);
  }, [asin]);

  // Save preferences per ASIN
  React.useEffect(() => {
    if (!asin || !prefsLoaded) return;
    try {
      const prefs = {
        calcTargetAcos,
        calcPrice,
        calcCvr,
        budgetUsd,
        horizonDays,
        scenario,
        kdpPreset,
      };
      localStorage.setItem(`acosGuidePrefs:${asin}`, JSON.stringify(prefs));
    } catch (_) {}
  }, [asin, prefsLoaded, calcTargetAcos, calcPrice, calcCvr, budgetUsd, horizonDays, scenario, kdpPreset]);
  // Effective values (fallback to recommended when inputs are empty/non‑finite)
  const effTargetAcos = Number.isFinite(calcTargetAcos) ? calcTargetAcos : (tMid ?? 30);
  const effPrice = Number.isFinite(calcPrice) ? calcPrice : (price || 9.99);
  const effCvr = Number.isFinite(calcCvr) ? calcCvr : (kdpPreset === 'low' ? 6 : 10);
  const calcCpc = (isFinite(effTargetAcos) && isFinite(effPrice) && isFinite(effCvr))
    ? (Math.max(0, effTargetAcos) / 100) * Math.max(0, effPrice) * (Math.max(0, effCvr) / 100)
    : null;
  const bidAuto  = calcCpc != null ? Math.max(0, calcCpc * 0.90) : null;
  const bidBroad = calcCpc != null ? Math.max(0, calcCpc * 0.85) : null;
  const bidExact = calcCpc != null ? Math.max(0, calcCpc * 1.10) : null;

  // Helpers and Forecasts
  const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
  const cvrDec = (Number.isFinite(effCvr) ? effCvr : 0) / 100;
  const cpcForCalc = Number.isFinite(calcCpc)
    ? calcCpc
    : (Number.isFinite(effTargetAcos) && effTargetAcos > 0 && effPrice > 0 && cvrDec > 0)
        ? (effTargetAcos / 100) * effPrice * cvrDec
        : null;
  const dailyClicks = (cpcForCalc && cpcForCalc > 0) ? (dailyTotal / cpcForCalc) : 0;
  const dailyOrders = dailyClicks * cvrDec;
  const dailySalesVal = dailyOrders * effPrice;
  const dailyAcos = dailySalesVal > 0 ? (dailyTotal / dailySalesVal) * 100 : null;
  const dailyProfit = dailyOrders * effectiveRoyalty - dailyTotal;
  const dailyRoas = dailyTotal > 0 ? (dailySalesVal / dailyTotal) : null;
  const dailyCpa = dailyOrders > 0 ? (dailyTotal / dailyOrders) : null;

  const totSpend = Number.isFinite(budgetUsd) ? budgetUsd : 0; // USD
  const totClicks = (cpcForCalc && cpcForCalc > 0) ? (totSpend / cpcForCalc) : 0;
  const totOrders = totClicks * cvrDec;
  const totSalesVal = totOrders * effPrice;
  const totAcos = totSalesVal > 0 ? (totSpend / totSalesVal) * 100 : null;
  const totProfit = totOrders * effectiveRoyalty - totSpend;
  const totRoas = totSpend > 0 ? (totSalesVal / totSpend) : null;
  const totCpa = totOrders > 0 ? (totSpend / totOrders) : null;

  const beCpc = (be != null && effPrice > 0 && cvrDec > 0) ? (be / 100) * effPrice * cvrDec : null;
  const targetCpcMin = (targetMin != null && effPrice > 0 && cvrDec > 0) ? (targetMin / 100) * effPrice * cvrDec : null;
  const targetCpcMax = (targetMax != null && effPrice > 0 && cvrDec > 0) ? (targetMax / 100) * effPrice * cvrDec : null;
  const curSym = '$';
  const spendDailyDisplay = dailyTotal;
  const spendTotalDisplay = totSpend;

  // Apply presets
  React.useEffect(() => {
    if (!prefsLoaded) return;
    if (kdpPreset === 'low') {
      // Low-Content: CVR conservativa, ACOS target più prudente
      setCalcCvr((prev) => (prev ? prev : 6));
      if (tMid != null) setCalcTargetAcos(Math.max(0, tMid * 0.9));
    } else {
      // Fiction/Non-Fiction: CVR base 10%, ACOS target su media suggerita
      setCalcCvr((prev) => (prev ? prev : 10));
      if (tMid != null) setCalcTargetAcos(tMid);
    }
  }, [kdpPreset, tMid, prefsLoaded]);

  // (moved budget planner state above)

  // CSV export for budget plan
  const exportBudgetCsv = () => {
    try {
      const rows = [];
      rows.push('ASIN,Scenario,Giorni,Budget Totale (USD),Spesa Giornaliera (USD)');
      rows.push(`${asin || 'N/A'},${scenario},${horizonDays},${Number(budgetUsd).toFixed(2)},${dailyTotal.toFixed(2)}`);
      rows.push('Sezione,Voce,Budget Giornaliero (USD),Budget Totale (USD)');
      const total = (x) => (x * Math.max(1, Number(horizonDays))).toFixed(2);
      rows.push(`Sponsored Products,Auto,${spAutoDaily.toFixed(2)},${total(spAutoDaily)}`);
      rows.push(`Sponsored Products,Broad/Phrase,${spBroadDaily.toFixed(2)},${total(spBroadDaily)}`);
      rows.push(`Sponsored Products,Exact,${spExactDaily.toFixed(2)},${total(spExactDaily)}`);
      rows.push(`Sponsored Brands,Totale,${sbDaily.toFixed(2)},${total(sbDaily)}`);
      rows.push(`Sponsored Display,Totale,${sdDaily.toFixed(2)},${total(sdDaily)}`);
      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `piano-budget-${asin || 'asin'}-${scenario}-${horizonDays}g.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (_) {}
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[92vw] sm:max-w-3xl md:max-w-6xl lg:max-w-7xl bg-slate-900 border-slate-700 text-white p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <Gauge className="w-6 h-6 text-emerald-400" />
              Guida all'Ottimizzazione dell'ACOS
            </DialogTitle>
            {/* Close button intentionally removed for compact UI; users can click outside or press ESC */}
          </div>
          <DialogDescription className="text-gray-400 mt-1">
            {asinData?.title || asinData?.asin}
          </DialogDescription>
        </DialogHeader>

        {/* Riepilogo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 pb-4">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[11px] text-gray-400">Prezzo di listino</p>
            <p className="text-white font-semibold">{price > 0 ? `$${price.toFixed(2)}` : '—'}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[11px] text-gray-400">Royalty per copia</p>
            <p className="text-white font-semibold">{effectiveRoyalty > 0 ? `$${effectiveRoyalty.toFixed(2)}` : '—'}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[11px] text-gray-400">ACOS di pareggio</p>
            <p className="text-white font-semibold">{asPct(be)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-[11px] text-gray-400">ACOS target consigliato</p>
            <p className="text-white font-semibold">{targetMin != null ? `${asPct(targetMin)} – ${asPct(targetMax)}` : '—'}</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6 space-y-8">
          {/* Azioni consigliate */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3"><Target className="w-5 h-5 text-emerald-400"/> Azioni consigliate</h3>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-gray-400">Imposta ACOS target</p>
                <p className="text-white font-semibold">{targetMin != null ? `${asPct(targetMin)} – ${asPct(targetMax)}` : '—'}</p>
                <p className="text-[12px] text-gray-400">Mantieni l'ACOS in questo intervallo per bilanciare profitto e crescita.</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-gray-400">CPC iniziale (in base alla CVR)</p>
                <ul className="text-[12px] text-gray-300">
                  {(() => {
                    const tMid = (targetMin != null && targetMax != null) ? (targetMin + targetMax) / 2 : null; // percent
                    const toCpc = (cvrPct) => (tMid != null && price > 0) ? ((tMid/100) * price * (cvrPct/100)) : null;
                    const rows = [5, 10, 15].map(cvr => ({ cvr, cpc: toCpc(cvr) }));
                    return rows.map(({ cvr, cpc }) => (
                      <li key={cvr}>• CVR {cvr}% ≈ {cpc != null ? `€${cpc.toFixed(2)}` : '—'}</li>
                    ));
                  })()}
                </ul>
                <p className="text-[12px] text-gray-400">Regola ±10–20% a settimana in base alle performance dei termini.</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-gray-400">Cadenza di ottimizzazione</p>
                <p className="text-white font-semibold">7d • 14d • 30d</p>
                <p className="text-[12px] text-gray-400">Finestre di revisione tattiche, bilanciate e strategiche.</p>
              </div>
            </div>
          </section>
          {/* Calcolatore CPC e Offerte */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><BadgePercent className="w-5 h-5 text-pink-400"/> Calcolatore CPC e Offerte</h3>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-gray-400">Preset KDP:</span>
                <button onClick={()=> setKdpPreset('low')} className={`px-2 py-1 rounded border text-[12px] ${kdpPreset==='low' ? 'border-emerald-400 text-white' : 'border-white/10 text-gray-300'}`}>Low‑Content</button>
                <button onClick={()=> setKdpPreset('fiction')} className={`px-2 py-1 rounded border text-[12px] ${kdpPreset==='fiction' ? 'border-emerald-400 text-white' : 'border-white/10 text-gray-300'}`}>Fiction/Non‑Fiction</button>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3 space-y-2">
                <label className="block text-[11px] text-gray-400">ACOS target (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder={(tMid ?? 30).toFixed(1)}
                  className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white"
                  value={Number.isFinite(calcTargetAcos) ? String(calcTargetAcos) : ''}
                  onChange={(e)=> {
                    const v = e.target.value;
                    if (v === '') { setCalcTargetAcos(NaN); return; }
                    setCalcTargetAcos(Number(v));
                  }}
                />
                <label className="block text-[11px] text-gray-400">Prezzo ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder={(price || 9.99).toFixed(2)}
                  className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white"
                  value={Number.isFinite(calcPrice) ? String(calcPrice) : ''}
                  onChange={(e)=> {
                    const v = e.target.value;
                    if (v === '') { setCalcPrice(NaN); return; }
                    setCalcPrice(Number(v));
                  }}
                />
                <label className="block text-[11px] text-gray-400">CVR (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder={String(kdpPreset === 'low' ? 6 : 10)}
                  className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white"
                  value={Number.isFinite(calcCvr) ? String(calcCvr) : ''}
                  onChange={(e)=> {
                    const v = e.target.value;
                    if (v === '') { setCalcCvr(NaN); return; }
                    setCalcCvr(Number(v));
                  }}
                />
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-gray-400">CPC consigliato</p>
                <p className="text-white font-semibold text-lg">{calcCpc != null ? `$${calcCpc.toFixed(2)}` : '—'}</p>
                <p className="text-[12px] text-gray-400">Formula: CPC ≈ ACOS target × Prezzo × CVR</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-gray-400">Offerte iniziali suggerite</p>
                <p className="text-white">Auto: {bidAuto != null ? `$${bidAuto.toFixed(2)}` : '—'}</p>
                <p className="text-white">Broad/Phrase: {bidBroad != null ? `$${bidBroad.toFixed(2)}` : '—'}</p>
                <p className="text-white">Exact: {bidExact != null ? `$${bidExact.toFixed(2)}` : '—'}</p>
                <p className="text-[12px] text-gray-400">Aggiusta ±10–20%/settimana in base a CTR, CVR e ACOS.</p>
              </div>
            </div>
          </section>
          {/* Pianificatore Budget (10.000 USD) */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><BarChart2 className="w-5 h-5 text-blue-400"/> Pianificatore Budget (10.000 USD)</h3>
              <button onClick={exportBudgetCsv} className="px-3 py-1.5 rounded border border-white/10 hover:border-emerald-400 text-[12px] text-gray-200">Esporta CSV</button>
            </div>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3 space-y-2">
                <label className="block text-[11px] text-gray-400">Budget totale (USD)</label>
                <input
                  type="number"
                  step="100"
                  min="0"
                  inputMode="numeric"
                  placeholder="10000"
                  className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white"
                  value={Number.isFinite(budgetUsd) ? String(budgetUsd) : ''}
                  onChange={(e)=> {
                    const v = e.target.value;
                    if (v === '') { setBudgetUsd(NaN); return; }
                    setBudgetUsd(Number(v));
                  }}
                />
                <label className="block text-[11px] text-gray-400">Orizzonte (giorni)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  inputMode="numeric"
                  placeholder="30"
                  className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white"
                  value={Number.isFinite(horizonDays) ? String(horizonDays) : ''}
                  onChange={(e)=> {
                    const v = e.target.value;
                    if (v === '') { setHorizonDays(NaN); return; }
                    setHorizonDays(Number(v));
                  }}
                />
                <label className="block text-[11px] text-gray-400">Scenario</label>
                <div className="flex gap-2">
                  {['conservativo','bilanciato','aggressivo'].map(s => (
                    <button key={s} onClick={()=> setScenario(s)}
                            className={`px-2 py-1 rounded border text-[12px] ${scenario===s ? 'border-emerald-400 text-white' : 'border-white/10 text-gray-300'}`}>{s}</button>
                  ))}
                </div>
                {/* FX alignment UI removed: all values assumed in USD */}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-gray-400">Spesa giornaliera totale</p>
                <p className="text-white font-semibold text-lg">{dailyTotal ? `$${dailyTotal.toFixed(2)}` : '—'}</p>
                <p className="text-[12px] text-gray-400">Budget USD ÷ Giorni</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-gray-400">Allocazione per canale (giorno)</p>
                <p className="text-white">SP: {`$${spDaily.toFixed(2)}`} • SB: {`$${sbDaily.toFixed(2)}`} • SD: {`$${sdDaily.toFixed(2)}`}</p>
                <p className="text-[12px] text-gray-400">Regola le percentuali cambiando scenario.</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-gray-400">Dettaglio SP (giorno)</p>
                <p className="text-white">Auto: {`$${spAutoDaily.toFixed(2)}`}</p>
                <p className="text-white">Broad/Phrase: {`$${spBroadDaily.toFixed(2)}`}</p>
                <p className="text-white">Exact: {`$${spExactDaily.toFixed(2)}`}</p>
                <p className="text-[12px] text-gray-400">Evita cap di budget: aumenta dove ACOS ≤ target e domanda esiste.</p>
              </div>
            </div>
          </section>
          {/* Previsioni ROI (Giornaliero & Orizzonte) */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><BarChart2 className="w-5 h-5 text-teal-400"/> Previsioni ROI</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Spesa giornaliera (usata per ACOS)</p>
                <p className="text-white font-semibold">{curSym}{fmt(spendDailyDisplay)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Clic stimati / Ordini</p>
                <p className="text-white font-semibold">{fmt(dailyClicks,0)} / {fmt(dailyOrders,1)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Vendite giornaliere (val.)</p>
                <p className="text-white font-semibold">${fmt(dailySalesVal)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">ACOS stimato (giorno)</p>
                <p className="text-white font-semibold">{dailyAcos != null ? `${fmt(dailyAcos,1)}%` : '—'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">ROAS stimato (giorno)</p>
                <p className="text-white font-semibold">{dailyRoas != null ? `${fmt(dailyRoas,2)}x` : '—'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Profitto stimato (giorno)</p>
                <p className="text-white font-semibold">€{fmt(dailyProfit)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">CPA (costo per ordine)</p>
                <p className="text-white font-semibold">${dailyCpa != null ? fmt(dailyCpa) : '—'}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Spesa totale (orizzonte, usata per ACOS)</p>
                <p className="text-white font-semibold">{curSym}{fmt(spendTotalDisplay)}</p>
                <p className="text-[12px] text-gray-400">(USD)</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Ordini (totali)</p>
                <p className="text-white font-semibold">{fmt(totOrders,1)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Vendite (totali)</p>
                <p className="text-white font-semibold">${fmt(totSalesVal)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">ACOS stimato (totale)</p>
                <p className="text-white font-semibold">{totAcos != null ? `${fmt(totAcos,1)}%` : '—'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">ROAS stimato (totale)</p>
                <p className="text-white font-semibold">{totRoas != null ? `${fmt(totRoas,2)}x` : '—'}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">Profitto stimato (totale)</p>
                <p className="text-white font-semibold">${fmt(totProfit)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-[11px] text-gray-400">CPA medio (totale)</p>
                <p className="text-white font-semibold">${totCpa != null ? fmt(totCpa) : '—'}</p>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">Tutte le metriche sono mostrate in USD ($).</div>
            {/* Sintesi veloce basata su target */}
            <div className="mt-3">
              {(() => {
                if (totAcos == null || targetMin == null || targetMax == null) return null;
                let tone = 'bg-white/5 text-gray-200 border border-white/10';
                let label = 'In target';
                if (totAcos <= targetMin) { tone = 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'; label = 'Sotto target — scala'; }
                else if (totAcos > targetMax && totAcos < (watchHi ?? Infinity)) { tone = 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20'; label = 'Sopra target — ottimizza'; }
                else if (watchHi != null && totAcos >= watchHi) { tone = 'bg-red-500/15 text-red-300 border border-red-500/20'; label = 'Sopra break-even — triage'; }
                return (
                  <div className={`px-3 py-2 rounded-md text-sm inline-flex items-center ${tone}`}>{label}</div>
                );
              })()}
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-gray-300">CPC atteso e range suggerito</p>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">BE CPC ≈ ${fmt(beCpc)}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">Target min ≈ ${fmt(targetCpcMin)}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">Target max ≈ ${fmt(targetCpcMax)}</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                {[5,10,15].map(cv => {
                  const cpc = (tMid != null && effPrice > 0) ? (tMid/100) * effPrice * (cv/100) : null;
                  const clicks = cpc && cpc>0 ? (dailyTotal / cpc) : 0;
                  const orders = clicks * (cv/100);
                  const sales = orders * effPrice;
                  const acos = sales>0 ? (dailyTotal / sales)*100 : null;
                  return (
                    <div key={cv} className="bg-white/5 rounded-lg p-3">
                      <p className="text-[11px] text-gray-400">Sensibilità CVR {cv}%</p>
                      <p className="text-white">CPC ≈ ${fmt(cpc)} • Clic ≈ {fmt(clicks,0)} • Ordini ≈ {fmt(orders,1)}</p>
                      <p className="text-[12px] text-gray-400">ACOS ≈ {acos!=null? `${fmt(acos,1)}%` : '—'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          {/* 10 Strategie Top per Principianti */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Lightbulb className="w-5 h-5 text-amber-400"/> 10 Strategie Top per Principianti</h3>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-300">
              <li>Imposta un ACOS target dall’ACOS di pareggio (BE × 60–85%) e usalo per guidare le decisioni.</li>
              <li>Avvia 3 campagne SP: Auto (scoperta), Broad/Phrase (esplorazione), Exact (vincenti).</li>
              <li>Stabilisci budget giornalieri costanti (es. $10–20/campagna) per raccogliere dati iniziali.</li>
              <li>Calcola l’offerta iniziale con CPC ≈ ACOS target × Prezzo × CVR (assumi CVR 10% se non nota).</li>
              <li>Ogni settimana: +10–20% sui termini che convertono sotto target; −10–30% su quelli costosi senza vendite.</li>
              <li>Usa il report dei termini di ricerca: sposta i vincenti in Exact; aggiungi negative dove sprecano.</li>
              <li>Aumenta il CTR: copertina forte, titolo/sottotitolo chiari, hook di genere, posizionamenti ottimizzati.</li>
              <li>Aumenta la CVR: descrizione persuasiva, Look Inside, prezzo competitivo, recensioni come social proof.</li>
              <li>Evita il cap di budget: se crolla a metà giornata con ACOS buono, alza budget del 20–40%.</li>
              <li>Registra le modifiche (data, termine, variazione, motivo) e valuta dopo 7–14 giorni.</li>
            </ol>
          </section>
          {/* Intervalli e soglie */}
          <section>
            <div className="bg-white/5 rounded-lg p-4 grid sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-gray-400">Intervallo ACOS accettato</p>
                <p className="text-white font-semibold">{targetMin != null ? `${asPct(targetMin)} – ${asPct(targetMax)}` : '—'}</p>
                <p className="text-xs text-gray-400">Mantieni l'ACOS in questo intervallo per bilanciare profitto e crescita.</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Massimo rigido (break‑even)</p>
                <p className="text-red-300 font-semibold">{asPct(watchHi)}</p>
                <p className="text-xs text-gray-400">Sopra questo valore è probabile una perdita per ordine.</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Intervalli di ottimizzazione</p>
                <p className="text-white font-semibold">7d • 14d • 30d</p>
                <p className="text-xs text-gray-400">Cicli brevi (tattici), bilanciati e strategici.</p>
              </div>
            </div>
          </section>
          {/* Benchmark e standard */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><BarChart2 className="w-5 h-5 text-blue-400"/> Benchmark e standard</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• <strong className="text-white">ACOS</strong> = Spesa adv ÷ Vendite adv. Più è basso, meglio è. <em className="text-gray-400">ROAS = 100 ÷ ACOS</em>.</li>
              <li>• <strong className="text-white">ACOS di pareggio</strong> = royalty ÷ prezzo. Sotto questo sei in profitto, sopra in perdita.</li>
              <li>• <strong className="text-white">ACOS target</strong>: tipicamente {`{`}BE × 60–85%{`}`} in base a margine vs crescita.</li>
              <li>• <strong className="text-white">CTR</strong>: obiettivo ≥ 0,3–0,7%; ≥ 1,0% è forte.</li>
              <li>• <strong className="text-white">CVR</strong> (tasso di conversione): 5–15% tipico; indagare se &lt; 3–5%.</li>
              <li>• <strong className="text-white">CPC</strong>: allinea le offerte a CVR e ACOS target. <em>CPC ≈ ACOS target × Prezzo × CVR</em>.</li>
              <li>• <strong className="text-white">TACOS</strong>: Spesa adv ÷ fatturato totale; utile a livello portafoglio.</li>
              <li>• <strong className="text-white">Finestra dati</strong>: valuta su ≥ 7–14 giorni con ≥ 20–40 clic per termine.</li>
            </ul>
          </section>

          {/* Schema decisionale */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Target className="w-5 h-5 text-emerald-400"/> Schema decisionale</h3>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-300">Sotto target</span>
                  <Pill tone="good">Scala</Pill>
                </div>
                <p className="text-gray-400">Se ACOS ≤ {asPct(targetMin)}: aumenta budget, offerte sui termini che convertono, amplia keyword/target, testa Top‑of‑Search.</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-300">In target</span>
                  <Pill>Mantieni</Pill>
                </div>
                <p className="text-gray-400">Se {asPct(targetMin)} &lt; ACOS ≤ {asPct(targetMax)}: procedi stabile; ottimizza gradualmente; fai harvesting dei termini di ricerca.</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-300">Sopra ACOS di pareggio</span>
                  <Pill tone="bad">Triage</Pill>
                </div>
                <p className="text-gray-400">Se ACOS ≥ {asPct(watchHi)}: metti in pausa/nega i termini scadenti, abbassa le offerte, stringi i match type, migliora conversione (prezzo, recensioni, pagina).</p>
              </div>
            </div>
          </section>

          {/* Cadenza di ottimizzazione */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><TrendingUp className="w-5 h-5 text-purple-400"/> Cadenza di ottimizzazione</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• <strong className="text-white">Finestre</strong>: 7 giorni (tattica), 14 giorni (bilanciata), 30 giorni (strategica).</li>
              <li>• <strong className="text-white">Settimanale</strong>: +10–20% offerte sui termini che convertono sotto target; −10–30% su costosi senza vendite.</li>
              <li>• <strong className="text-white">Quindicinale</strong>: aggiungi negative dai report; sposta i vincenti in campagne exact.</li>
              <li>• <strong className="text-white">Mensile</strong>: ristruttura (match type/categoria), aggiorna creatività, testa posizionamenti/dayparting.</li>
            </ul>
          </section>

          {/* Tipologie di campagna e struttura */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Layers3 className="w-5 h-5 text-sky-400"/> Tipologie di campagna e struttura</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-white font-semibold">Sponsored Products</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Motore principale di performance; utile per harvesting e scalare.</li>
                  <li>• Struttura per match type (Auto, Broad/Phrase, Exact) e tema.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-white font-semibold">Sponsored Brands / Display</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Usa per discovery, brand lift e retargeting; ACOS target più morbidi.</li>
                  <li>• Misura con TACOS; assistono conversioni oltre l'ultimo clic.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-white font-semibold">Match type</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Auto per discovery; estrai termini di ricerca.</li>
                  <li>• Broad/Phrase per esplorazione controllata.</li>
                  <li>• Exact per scalare i vincenti in modo efficiente.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p className="text-white font-semibold">Placements</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Top‑of‑Search: aggressivo sui vincenti con ACOS basso.</li>
                  <li>• Product Pages: riduci se CTR/CVR sono deboli.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Harvesting e negative */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Waypoints className="w-5 h-5 text-green-400"/> Harvesting e negative</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• Pipeline: Auto → Broad/Phrase → Exact (per i termini che convertono).</li>
              <li>• Aggiungi negative (phrase/exact) a livello gruppo/campagna per bloccare sprechi e instradare il traffico.</li>
              <li>• Regola pratica: nega termini con 40–60 clic e 0 vendite; o spesa ≥ {asPct(be)} del prezzo senza ordini.</li>
            </ul>
          </section>

          {/* Playbook pratico */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Lightbulb className="w-5 h-5 text-amber-400"/> Playbook pratico</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">Aumentare le impression</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Espandi keyword (broad/phrase), targeting per prodotto/categoria.</li>
                  <li>• Aumenta i budget; alza moderatamente le offerte sui termini rilevanti.</li>
                  <li>• Attiva aggiustamenti Top‑of‑Search sui vincenti.</li>
                  <li>• Aggiungi target ASIN/pagine prodotto affini (adiacenza libri).</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">Se il CTR è basso (&lt;0,3–0,5%)</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Aumenta pertinenza: aggiungi negative; separa gruppi per tema.</li>
                  <li>• Per i libri: ottimizza copertina/titolo/sottotitolo; prezzo competitivo; costruisci recensioni.</li>
                  <li>• Sposta termini generici su phrase/exact; concentrati su query ad alta intenzione.</li>
                  <li>• Ottimizza moltiplicatori di posizionamento; riduci Product Pages se irrilevanti.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">Aumentare i clic</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Alza offerte su termini profittevoli ad alto CTR; harvest long‑tail in exact.</li>
                  <li>• Evita cap di budget (niente ore "out of budget").</li>
                  <li>• Migliora pertinenza annuncio e segnali qualità pagina.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">Clic ma nessun ordine</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Controlla conversione pagina: copertina, descrizione, Look Inside, recensioni, prezzo, disponibilità.</li>
                  <li>• Aggiungi negative per query irrilevanti; abbassa offerte su non‑converter.</li>
                  <li>• Passa a exact/termini ad alta intenzione; valuta coupon/prezzi promo.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Budget, offerte e posizionamenti */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><BadgePercent className="w-5 h-5 text-pink-400"/> Budget, offerte e posizionamenti</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• Budget: evita di esaurire a metà giornata; valuta dayparting se la resa varia per ora.</li>
              <li>• Offerte: parti da CPC ≈ ACOS target × Prezzo × CVR; regola ±10–20% a settimana in base ai termini.</li>
              <li>• Posizionamenti: spingi Top‑of‑Search sui vincenti; limita Product Pages dove l'ACOS sale.</li>
            </ul>
          </section>

          {/* Regole avanzate di tuning */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><TrendingUp className="w-5 h-5 text-lime-400"/> Regole avanzate di tuning</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• Se ACOS ≤ 0,6×Target per 7–14gg con ≥3 ordini: alza offerta +15–25% e testa Top‑of‑Search +20–40%.</li>
              <li>• Se ACOS in [0,6×, 1,0×]Target: mantieni o +5–10% sui top performer; sposta in exact.</li>
              <li>• Se ACOS ≥ 1,2×Target con ≥20 clic: riduci offerta −15–30%; stringi a phrase/exact; aggiungi negative.</li>
              <li>• Se 40–60 clic e 0 ordini: pausa/nega; sposta la discovery a offerte più basse; verifica la pagina.</li>
              <li>• Se CTR &lt; 0,3%: affina keyword, riduci generiche, migliora creatività/pagina, ottimizza posizionamenti.</li>
              <li>• Se il budget va in cap a metà giornata con ACOS ≤ Target: aumenta budget +20–40%.</li>
              <li>• Se CTR alto ma CVR bassa (ACOS alto): sistema prezzo/recensioni/contenuti; riduci posizionamenti irrilevanti.</li>
              <li>• Per nuovi lanci: parti più ampio con budget stretti; sposta budget su exact quando emergono i vincenti.</li>
            </ul>
          </section>

          {/* Glossario KPI */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Focus className="w-5 h-5 text-cyan-400"/> Glossario KPI</h3>
            <div className="grid sm:grid-cols-2 gap-3 text-sm text-gray-300">
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p><strong className="text-white">Impression</strong>: quante volte l'annuncio è mostrato.</p>
                <p><strong className="text-white">Clic</strong>: clic dell'utente sull'annuncio.</p>
                <p><strong className="text-white">CTR</strong>: Clic ÷ Impression.</p>
                <p><strong className="text-white">CPC</strong>: Spesa ÷ Clic.</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1">
                <p><strong className="text-white">Ordini</strong>: acquisti attribuiti.</p>
                <p><strong className="text-white">CVR</strong>: Ordini ÷ Clic.</p>
                <p><strong className="text-white">Vendite</strong>: ricavi attribuiti.</p>
                <p><strong className="text-white">ACOS / ROAS</strong>: Spesa ÷ Vendite; Vendite ÷ Spesa.</p>
              </div>
            </div>
          </section>

          {/* Matrice di troubleshooting */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-red-400"/> Matrice di troubleshooting</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">ACOS alto + CTR basso</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Problema di pertinenza: stringi keyword, aggiungi negative, affina targeting.</li>
                  <li>• Migliora creatività/hook della pagina; prova posizionamenti.</li>
                  <li>• Abbassa offerte su termini generici; passa a phrase/exact su query ad alta intenzione.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">CTR alto + ACOS alto (CVR bassa)</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Attenzione alta ma conversione bassa: sistema prezzo, recensioni, qualità pagina, disponibilità.</li>
                  <li>• Riduci posizionamenti irrilevanti; passa a exact; aggiungi negative.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">ACOS basso + volume basso</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Scala: alza budget, offerte sui vincenti, espandi keyword/target, testa Top‑of‑Search.</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-lg p-3 space-y-1.5">
                <p className="text-white font-semibold">Clic ma nessun ordine</p>
                <ul className="text-gray-300 space-y-1">
                  <li>• Migliora conversione pagina (copertina, titolo/sottotitolo, descrizione, Look Inside, prezzo, recensioni).</li>
                  <li>• Aggiungi negative; abbassa offerte sui non‑converter; passa a exact ad alta intenzione.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Dayparting e stagionalità */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><Clock className="w-5 h-5 text-indigo-400"/> Dayparting e stagionalità</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• Monitora spesa oraria vs conversioni; riduci nelle ore deboli, spingi nelle ore forti.</li>
              <li>• Stagionalità (festività, back‑to‑school): alza budget/offerte prima dei picchi; limiti più stretti dopo.</li>
            </ul>
          </section>

          {/* Gestione delle modifiche */}
          <section>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2"><BarChart2 className="w-5 h-5 text-teal-400"/> Gestione delle modifiche</h3>
            <ul className="text-sm text-gray-300 space-y-1.5">
              <li>• Registra modifiche (data, termine, variazione offerta/budget, motivo); valuta dopo una finestra completa.</li>
              <li>• Evita troppe modifiche simultanee; isola gli effetti.</li>
              <li>• Ripristina o itera in base a variazioni di ACOS/CTR/CVR e volume ordini.</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AsinAcosGuideModal;
