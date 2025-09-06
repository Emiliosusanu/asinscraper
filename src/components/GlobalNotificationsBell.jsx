import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const loadPayload = () => {
  try {
    const raw = localStorage.getItem('globalNotifications');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const GlobalNotificationsBell = () => {
  const [payload, setPayload] = React.useState(() => loadPayload());
  const [ackTs, setAckTs] = React.useState(() => {
    try { return Number(localStorage.getItem('globalNotificationsAckTs')) || 0; } catch (_) { return 0; }
  });
  const [ackFp, setAckFp] = React.useState(() => {
    try { return localStorage.getItem('globalNotificationsAckFp') || ''; } catch (_) { return ''; }
  });

  const hasUnread = React.useMemo(() => {
    if (!payload) return false;
    const importantCount = (payload?.counts?.better || 0) + (payload?.counts?.worse || 0);
    if (!importantCount) return false;
    const fp = payload?.fingerprint;
    if (fp) {
      return fp !== ackFp;
    }
    // fallback based on timestamp only
    const ts = payload?.ts || 0;
    return ts > ackTs;
  }, [payload, ackTs, ackFp]);

  React.useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key === 'globalNotifications') {
        try {
          const p = ev.newValue ? JSON.parse(ev.newValue) : null;
          setPayload(p);
        } catch (_) {}
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
      const fp = payload?.fingerprint || '';
      localStorage.setItem('globalNotificationsAckFp', fp);
      setAckFp(fp);
      // notify same-tab listeners
      try { window.dispatchEvent(new Event('globalNotificationsAckChanged')); } catch (_) {}
    } catch (_) {}
  };

  const counts = payload?.counts || { better: 0, worse: 0, stable: 0 };
  const details = Array.isArray(payload?.details) ? payload.details : [];
  const better = [...details.filter(d => d.guard === 'better')].sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct));
  const worse  = [...details.filter(d => d.guard === 'worse')].sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct));
  const [expanded, setExpanded] = React.useState({});

  // --- Smart summary & insights ---
  const sumPct = (arr) => arr.reduce((acc, d) => acc + (Number.isFinite(d.pct) ? d.pct : 0), 0);
  const netDelta = sumPct(better) - Math.abs(sumPct(worse));
  const sentimentLabel = netDelta > 0 ? 'Trend positivo' : netDelta < 0 ? 'Trend negativo' : 'Trend stabile';
  const updatedAt = payload?.ts ? new Date(payload.ts) : null;
  const timeAgo = (() => {
    if (!updatedAt) return '—';
    const s = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
    if (s < 60) return `${s}s fa`;
    const m = Math.floor(s/60); if (m < 60) return `${m}m fa`;
    const h = Math.floor(m/60); if (h < 24) return `${h}h fa`;
    const d = Math.floor(h/24); return `${d}g fa`;
  })();

  // Top drivers frequency
  const driverCounts = {};
  for (const d of details) {
    if (Array.isArray(d.drivers)) {
      d.drivers.slice(0, 5).forEach((drv) => {
        driverCounts[drv] = (driverCounts[drv] || 0) + 1;
      });
    }
  }
  const topDrivers = Object.entries(driverCounts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 6);

  // Actionable recommendations
  const recs = [];
  if ((counts.worse || 0) > 0) {
    recs.push('Rivedi i termini peggiorati: riduci offerte o aggiungi negative dove non convertono.');
  }
  if ((counts.better || 0) > 0) {
    recs.push('Scala budget/offerte su termini e campagne con performance in miglioramento.');
  }
  if (topDrivers.length > 0) {
    recs.push('Focalizzati sui driver principali evidenziati qui sotto per un impatto rapido.');
  }
  if (recs.length === 0) {
    recs.push('Nessuna azione urgente: continua a monitorare.');
  }

  const sentiment = (() => {
    if (!payload) return 'neutral';
    if ((counts.better || 0) === 0 && (counts.worse || 0) === 0) return 'neutral';
    if ((counts.worse || 0) > (counts.better || 0)) return 'bad';
    if ((counts.better || 0) >= (counts.worse || 0)) return 'good';
    return 'neutral';
  })();

  const Smiley = ({ mode }) => {
    const tone = mode === 'good' ? 'from-emerald-300 to-emerald-500'
               : mode === 'bad' ? 'from-rose-300 to-rose-500'
               : 'from-amber-300 to-amber-500';
    // eyes & mouth colors against gradient
    const faceFg = 'bg-black/80';
    return (
      <div className={`w-9 h-9 rounded-full relative overflow-hidden shadow-lg bg-gradient-to-b ${tone}`}>
        {/* eyes */}
        <span className={`absolute w-1.5 h-1.5 ${faceFg} rounded-full left-[30%] top-[35%]`} />
        <span className={`absolute w-1.5 h-1.5 ${faceFg} rounded-full left-[60%] top-[35%]`} />
        {/* mouth */}
        {mode === 'bad' ? (
          <span className="absolute left-1/2 top-[62%] -translate-x-1/2 w-4 h-2 border-t-2 border-black/80 rounded-t-full" />
        ) : mode === 'good' ? (
          <span className="absolute left-1/2 top-[60%] -translate-x-1/2 w-4 h-2 border-b-2 border-black/80 rounded-b-full" />
        ) : (
          <span className="absolute left-1/2 top-[60%] -translate-x-1/2 w-3 h-[2px] bg-black/80 rounded-full" />
        )}
        {/* subtle sparkle */}
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-white/30 rounded-full blur-[2px]" />
      </div>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className={`w-10 h-10 relative rounded-full p-0 ${hasUnread ? 'ring-2 ring-amber-300/60' : ''}`}>
          <Smiley mode={sentiment} />
          {hasUnread && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" avoidCollisions={false} className="bg-slate-900 border-slate-700 text-white w-[96vw] sm:w-[36rem] max-h-[74vh] overflow-auto shadow-2xl rounded-2xl p-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-100 data-[state=open]:animate-none data-[state=closed]:animate-none">
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300 font-semibold">Notifiche Intelligenti</p>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white border border-emerald-500/30">Better: {counts.better}</span>
              <span className="px-1.5 py-0.5 rounded bg-red-600 text-white border border-red-500/30">Worse: {counts.worse}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-gray-100 border border-slate-600">Stable: {counts.stable}</span>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 space-y-3 pb-20">
          {/* Insights summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Net Impact</p>
              <p className={`text-sm font-semibold ${netDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{netDelta.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Sentiment</p>
              <p className="text-sm font-semibold text-gray-200">{sentimentLabel}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Aggiornato</p>
              <p className="text-sm font-semibold text-gray-200">{timeAgo}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Elementi</p>
              <p className="text-sm font-semibold text-gray-200">{details.length}</p>
            </div>
          </div>

          {/* Top drivers */}
          {topDrivers.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Driver principali</p>
              <div className="flex flex-wrap gap-1.5">
                {topDrivers.map(([drv, n]) => (
                  <span key={drv} className="px-2 py-0.5 rounded bg-slate-700 text-gray-100 border border-slate-600 text-[11px]">{drv} ×{n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Raccomandazioni</p>
            <ul className="list-disc pl-4 text-[12px] text-gray-200 space-y-1">
              {recs.map((r, i) => (<li key={i}>{r}</li>))}
            </ul>
          </div>

          {/* How this is calculated */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-1">Come calcoliamo queste notifiche</p>
            <ul className="list-disc pl-4 text-[12px] text-gray-300 space-y-1">
              <li><span className="text-gray-200 font-medium">Finestra</span>: confronto tra ultimi 30 giorni e i 30 giorni precedenti (MoM).</li>
              <li><span className="text-gray-200 font-medium">Guadagno stimato</span>: da BSR → vendite stimate → royalty; poi media del range mensile.</li>
              <li><span className="text-gray-200 font-medium">MoM%</span>: ((MeseCorrente − MesePrecedente) ÷ MesePrecedente) × 100.</li>
              <li><span className="text-gray-200 font-medium">Driver</span>: BSR medio (±3%), Velocità recensioni (±0.1/giorno), Royalty (±1%) o Prezzo (±1%).</li>
              <li><span className="text-gray-200 font-medium">Confidenza</span>: giornate coperte (≥14 alta, ≥7 media, altrimenti bassa) e numero di campioni.</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <p className="text-xs text-emerald-300 mb-2">Miglioramenti</p>
              {better.length > 0 ? better.map((d, i) => (
                <div key={`b-${d.id || i}`} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm text-gray-200" title={d.title || d.asin}>{d.title || d.asin}</div>
                    <div className="text-emerald-300 text-sm font-semibold">+{Math.abs(d.pct).toFixed(1)}%</div>
                  </div>
                  {Array.isArray(d.drivers) && d.drivers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.drivers.slice(0,3).map((drv, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded text-[11px] bg-emerald-600 text-white border border-emerald-500/30">{drv}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">Confidenza: {d.confidence === 'high' ? 'alta' : d.confidence === 'medium' ? 'media' : 'bassa'}</div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [d.id || i]: !prev[d.id || i] }))}
                      className="text-[11px] text-gray-200 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-2 py-1"
                    >{expanded[d.id || i] ? 'Nascondi dettagli' : 'Dettagli'}</button>
                  </div>
                  {expanded[d.id || i] && d.stats && (
                    <div className="mt-2 border border-slate-700 rounded p-2 text-[12px] text-gray-200 bg-slate-900">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-gray-400 text-[11px]">Guadagno stimato (medio)</p>
                          <p>Precedente: ${Number(d.stats.m1 || 0).toFixed(2)}</p>
                          <p>Corrente: ${Number(d.stats.m2 || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[11px]">BSR medio</p>
                          <p>Prec: {d.stats.b1 || 0}</p>
                          <p>Corr: {d.stats.b2 || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[11px]">Velocità recensioni (al g)</p>
                          <p>Prec: {Number(d.stats.v1 || 0).toFixed(2)}</p>
                          <p>Corr: {Number(d.stats.v2 || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[11px]">Prezzo medio / Royalty media</p>
                          <p>${Number(d.stats.p1 || 0).toFixed(2)} → ${Number(d.stats.p2 || 0).toFixed(2)}</p>
                          <p>${Number(d.stats.r1 || 0).toFixed(2)} → ${Number(d.stats.r2 || 0).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-gray-400">Copertura: {d.stats.coverageDays || 0} giorni • Campioni: prev {d.stats.samples?.prev || 0}, curr {d.stats.samples?.curr || 0}</div>
                    </div>
                  )}
                </div>
              )) : (
                <p className="text-xs text-gray-400">Nessun miglioramento recente.</p>
              )}
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <p className="text-xs text-red-300 mb-2">Peggioramenti</p>
              {worse.length > 0 ? worse.map((d, i) => (
                <div key={`w-${d.id || i}`} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm text-gray-200" title={d.title || d.asin}>{d.title || d.asin}</div>
                    <div className="text-red-300 text-sm font-semibold">-{Math.abs(d.pct).toFixed(1)}%</div>
                  </div>
                  {Array.isArray(d.drivers) && d.drivers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.drivers.slice(0,3).map((drv, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded text-[11px] bg-red-600 text-white border border-red-500/30">{drv}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">Confidenza: {d.confidence === 'high' ? 'alta' : d.confidence === 'medium' ? 'media' : 'bassa'}</div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [d.id || i]: !prev[d.id || i] }))}
                      className="text-[11px] text-gray-200 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-2 py-1"
                    >{expanded[d.id || i] ? 'Nascondi dettagli' : 'Dettagli'}</button>
                  </div>
                  {expanded[d.id || i] && d.stats && (
                    <div className="mt-2 border border-slate-700 rounded p-2 text-[12px] text-gray-200 bg-slate-900">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-gray-400 text-[11px]">Guadagno stimato (medio)</p>
                          <p>Precedente: ${Number(d.stats.m1 || 0).toFixed(2)}</p>
                          <p>Corrente: ${Number(d.stats.m2 || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[11px]">BSR medio</p>
                          <p>Prec: {d.stats.b1 || 0}</p>
                          <p>Corr: {d.stats.b2 || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[11px]">Velocità recensioni (al g)</p>
                          <p>Prec: {Number(d.stats.v1 || 0).toFixed(2)}</p>
                          <p>Corr: {Number(d.stats.v2 || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-[11px]">Prezzo medio / Royalty media</p>
                          <p>${Number(d.stats.p1 || 0).toFixed(2)} → ${Number(d.stats.p2 || 0).toFixed(2)}</p>
                          <p>${Number(d.stats.r1 || 0).toFixed(2)} → ${Number(d.stats.r2 || 0).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-gray-400">Copertura: {d.stats.coverageDays || 0} giorni • Campioni: prev {d.stats.samples?.prev || 0}, curr {d.stats.samples?.curr || 0}</div>
                    </div>
                  )}
                </div>
              )) : (
                <p className="text-xs text-gray-400">Nessun peggioramento recente.</p>
              )}
            </div>
          </div>
          {better.length === 0 && worse.length === 0 && (
            <p className="text-sm text-gray-400">Nessuna notifica importante al momento.</p>
          )}
        </div>
        {/* Solid sticky footer actions */}
        <div className="sticky bottom-0 z-10 bg-slate-900 border-t border-slate-700 px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" className="bg-slate-700 hover:bg-slate-600 text-white border border-slate-600" onClick={markAsRead}>Segna come letto</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default GlobalNotificationsBell;
