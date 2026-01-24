import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalNotificationsBell from '@/components/GlobalNotificationsBell';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLocation } from 'react-router-dom';

const loadPayload = () => {
  try {
    const raw = localStorage.getItem('globalNotifications');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const pad2 = (n) => String(n).padStart(2, '0');
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fmtEUR = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Math.max(0, Number(v) || 0));

function computePayoutForMonth(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  let payoutDate = new Date(year, month, Math.min(29, lastDay));
  const wd = payoutDate.getDay();
  if (wd === 6) payoutDate.setDate(payoutDate.getDate() + 2);
  else if (wd === 0) payoutDate.setDate(payoutDate.getDate() + 1);
  return payoutDate;
}

const NotificationPet = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [payload, setPayload] = React.useState(() => loadPayload());
  const [ackTs, setAckTs] = React.useState(() => {
    try { return Number(localStorage.getItem('globalNotificationsAckTs')) || 0; } catch (_) { return 0; }
  });
  const [ackFp, setAckFp] = React.useState(() => {
    try { return localStorage.getItem('globalNotificationsAckFp') || ''; } catch (_) { return ''; }
  });
  // Removed greeting animations for a solid, non-flashing UI
  
  const [isDancing, setIsDancing] = React.useState(false);
  const danceTimerRef = React.useRef(null);

  const displayName = React.useMemo(() => {
    const meta = user?.user_metadata || {};
    return (
      meta.full_name ||
      meta.name ||
      (user?.email ? user.email.split('@')[0] : null) ||
      'amico'
    );
  }, [user?.id, user?.email, user?.user_metadata]);

  const routeKey = location?.pathname || '/';
  const [hello, setHello] = React.useState({ show: false, title: '', lines: [] });
  const helloTimerRef = React.useRef(null);
  const payloadRef = React.useRef(payload);
  React.useEffect(() => { payloadRef.current = payload; }, [payload]);

  const counts = payload?.counts || { better: 0, worse: 0, stable: 0 };
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const dayKey = fmtYMD(today);
  const payoutDate = computePayoutForMonth(y, m);
  const isPayoutDay = today.toDateString() === payoutDate.toDateString();
  const target = new Date(y, m - 2, 1);
  const targetKey = `${target.getFullYear()}-${pad2(target.getMonth()+1)}`;
  // --- Lightweight learning snapshot (local only) ---
  const learning = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('notifLearningV1');
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }, [payload?.fingerprint]);

  // Rank details with the same simple model as the drawer
  const recommended = React.useMemo(() => {
    const details = Array.isArray(payload?.details) ? payload.details : [];
    if (!details.length) return [];
    const L = learning || {};
    const diff = (pos = 0, neg = 0) => (Number(pos||0) - 1.2 * Number(neg||0));
    const confW = (c) => c === 'high' ? 1 : c === 'medium' ? 0.7 : 0.5;
    const scoreOf = (n) => {
      let s = 0;
      for (const d of (n.drivers || [])) {
        const st = L?.driver?.[String(d)] || { pos: 0, neg: 0 };
        s += diff(st.pos, st.neg) * 10;
      }
      if (n.asin) {
        const a = L?.asin?.[String(n.asin)] || { pos: 0, neg: 0 };
        s += diff(a.pos, a.neg) * 8;
      }
      if (n.guard) { // kind/status
        const k = L?.kind?.[String(n.guard)] || { pos: 0, neg: 0 };
        s += diff(k.pos, k.neg) * 6;
      }
      s *= confW(n.confidence);
      const score = Math.max(0, Math.min(100, Math.round(50 + s)));
      return score;
    };
    const arr = details.map((d) => ({ ...d, _score: scoreOf(d) })).sort((a,b)=> (b._score - a._score));
    return arr.filter((d) => d._score >= 70).slice(0, 3);
  }, [payload?.details, learning]);
  const sentiment = React.useMemo(() => {
    if (!payload) return 'neutral';
    if ((counts.better || 0) === 0 && (counts.worse || 0) === 0) return 'neutral';
    if ((counts.worse || 0) > (counts.better || 0)) return 'bad';
    if ((counts.better || 0) >= (counts.worse || 0)) return 'good';
    return 'neutral';
  }, [payload, counts.better, counts.worse]);

  const shouldShow = React.useMemo(() => {
    const importantCount = (payload?.counts?.better || 0) + (payload?.counts?.worse || 0);
    if (!importantCount) return false;
    const fp = payload?.fingerprint;
    if (fp) return fp !== ackFp;
    const ts = payload?.ts || 0;
    return ts > ackTs;
  }, [payload, ackTs, ackFp]);

  // Auto pop a short-lived bubble for recommended items on new payload
  const [showReco, setShowReco] = React.useState(false);
  const recoTimerRef = React.useRef(null);
  React.useEffect(() => {
    if (!shouldShow || recommended.length === 0 || isPayoutDay) return;
    setShowReco(true);
    if (recoTimerRef.current) clearTimeout(recoTimerRef.current);
    recoTimerRef.current = setTimeout(() => setShowReco(false), 15000);
    return () => { if (recoTimerRef.current) clearTimeout(recoTimerRef.current); };
  }, [shouldShow, recommended.length, isPayoutDay, payload?.fingerprint]);

  React.useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key === 'globalNotifications') {
        setPayload(loadPayload());
      }
      if (ev.key === 'globalNotificationsAckTs' || ev.key === 'globalNotificationsAckFp') {
        try {
          setAckTs(Number(localStorage.getItem('globalNotificationsAckTs')) || 0);
          setAckFp(localStorage.getItem('globalNotificationsAckFp') || '');
        } catch (_) {}
      }
    };
    const onUpdated = () => setPayload(loadPayload());
    const onAckChanged = () => {
      try {
        setAckTs(Number(localStorage.getItem('globalNotificationsAckTs')) || 0);
        setAckFp(localStorage.getItem('globalNotificationsAckFp') || '');
      } catch (_) {}
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('globalNotificationsUpdated', onUpdated);
    window.addEventListener('globalNotificationsAckChanged', onAckChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('globalNotificationsUpdated', onUpdated);
      window.removeEventListener('globalNotificationsAckChanged', onAckChanged);
    };
  }, []);

  // Payout-day celebration state
  const [payoutTotal, setPayoutTotal] = React.useState(null);
  const [showBubble, setShowBubble] = React.useState(false);
  const [talkIdx, setTalkIdx] = React.useState(0);
  const [quoteStep, setQuoteStep] = React.useState(0);
  const quotes = React.useMemo(() => [
    'La costanza batte il talento quando il talento non è costante.',
    'Un libro alla volta, un giorno alla volta.',
    'Numeri veri, risultati veri. Avanti tutta!',
    'Le piccole azioni quotidiane costruiscono grandi risultati.',
    'Continua a scrivere: il successo ama la disciplina.',
    // 20+ business-focused quotes
    'La strategia decide la direzione, l’esecuzione porta i risultati.',
    'La velocità di apprendimento è il tuo vantaggio competitivo.',
    'Il cashflow è ossigeno: proteggilo con disciplina.',
    'Semplice scala meglio: riduci l’attrito, aumenta il valore.',
    'Decidi in base ai dati, ispira con la visione.',
    'I margini crescono dove c’è focus, non dove c’è caos.',
    'Il mercato premia chi risolve problemi reali, meglio e prima.',
    'Il brand è fiducia accumulata nel tempo.',
    'Ripeti ciò che funziona, misura ciò che conta, taglia il resto.',
    'Le abitudini quotidiane creano fatturato mensile.',
    'Fai una cosa piccola ogni giorno: la traiettoria cambia.',
    'Il prezzo racconta una storia: scegli tu quale.',
    'Le vendite seguono l’attenzione. L’attenzione segue il valore.',
    'Cicli brevi: testa, misura, itera, scala.',
    'La qualità è una conseguenza di processi chiari.',
    'Automatizza il ripetibile, concentra l’energia sul creativo.',
    'Più vicino al cliente, più vicino alla soluzione.',
    'La perseveranza trasforma gli esperimenti in sistemi.',
    'Ogni ostacolo ben compreso è una feature del tuo vantaggio.',
    'Eccellenza operativa oggi, crescita sostenibile domani.',
    'Piccoli miglioramenti quotidiani compongono grandi risultati.',
    'Una metrica alla volta: ciò che misuri migliora.',
    'Crea domanda con contenuti, catturala con un’offerta chiara.',
    'Team piccoli, responsabilità grandi, feedback veloci.',
  ], []);

  // Daily shuffled order for payout quotes (no repeats until full cycle)
  const quotesOrder = React.useMemo(() => {
    const key = `petQuotesOrder:${dayKey}`;
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr) && arr.length === quotes.length) return arr;
    } catch (_) {}
    const arr = Array.from({ length: quotes.length }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (_) {}
    return arr;
  }, [dayKey, quotes.length]);

  // Dance controller and animation mode
  const animation = React.useMemo(() => {
    if (isPayoutDay) return 'petDance 1.8s ease-in-out infinite';
    if (isDancing) return 'petDance 1.2s ease-in-out 2';
    return 'petBreathe 8s ease-in-out infinite';
  }, [isPayoutDay, isDancing]);

  const handleDanceTrigger = () => {
    if (isPayoutDay) return; // already dancing all day
    setIsDancing(true);
    if (danceTimerRef.current) clearTimeout(danceTimerRef.current);
    danceTimerRef.current = setTimeout(() => setIsDancing(false), 2400);
  };

  React.useEffect(() => {
    return () => { if (danceTimerRef.current) clearTimeout(danceTimerRef.current); };
  }, []);

  React.useEffect(() => {
    if (!user) return;
    const now = Date.now();
    const seenKey = `petLastSeen:${routeKey}`;
    const fpKey = `petLastFp:${routeKey}`;
    let lastSeen = 0;
    let lastFp = '';
    try {
      lastSeen = Number(localStorage.getItem(seenKey)) || 0;
      lastFp = localStorage.getItem(fpKey) || '';
    } catch (_) {}

    try { localStorage.setItem(seenKey, String(now)); } catch (_) {}

    const fire = () => {
      const p = payloadRef.current;
      const pTs = Number(p?.ts) || 0;
      const pFp = p?.fingerprint || '';
      const hasNewPayload = lastSeen ? (pTs > lastSeen) : Boolean(pTs);
      const hasChanged = Boolean(pFp && lastFp && pFp !== lastFp);

      const c = p?.counts || { better: 0, worse: 0, stable: 0 };
      const messages = Array.isArray(p?.messages) ? p.messages : [];

      const lines = [];
      if (!lastSeen) {
        if (p) {
          lines.push(`Oggi: ${c.better || 0} miglioramenti, ${c.worse || 0} peggioramenti.`);
        } else {
          lines.push('Pronto quando vuoi: aggiorna i dati e controllo le variazioni per te.');
        }
      } else if (hasNewPayload || hasChanged) {
        lines.push(`Da quando sei andato via: ${c.better || 0} miglioramenti, ${c.worse || 0} peggioramenti.`);
        if (messages[0]) lines.push(messages[0]);
      } else {
        lines.push('Nessun cambiamento importante dall’ultima visita.');
      }

      if (pFp) {
        try { localStorage.setItem(fpKey, pFp); } catch (_) {}
      }

      setHello({ show: true, title: `Ciao ${displayName}`, lines });
      if (helloTimerRef.current) clearTimeout(helloTimerRef.current);
      helloTimerRef.current = setTimeout(() => setHello((h) => ({ ...h, show: false })), 8000);
    };

    const t = setTimeout(fire, 180);
    return () => { clearTimeout(t); if (helloTimerRef.current) clearTimeout(helloTimerRef.current); };
  }, [user?.id, routeKey, displayName]);

  // Month-to-date (MTD) talking mode
  const curKey = `${y}-${pad2(m+1)}`;
  const [mtdEUR, setMtdEUR] = React.useState(null);
  const GOAL = 10000;
  const talkPool = React.useMemo(() => [
    'Finora questo mese: {mtd} — puntiamo a {goal}!',
    'Siamo a {pct}% dell’obiettivo. Avanti così!',
    'Ogni pagina conta. {mtd} questo mese, focus su {goal}!',
    'Momentum in costruzione: {mtd}. Acceleriamo verso {goal}!',
    'Ottimo inizio ({mtd}), ma non basta: obiettivo {goal}.',
    'Passi brevi ogni giorno portano lontano. {mtd} finora.',
    'Stringiamo le viti: {mtd} non è abbastanza, miriamo a {goal}.',
    'Dati alla mano: {mtd} MTD. Prossimo step: strategie per {goal}.',
    'La disciplina batte la motivazione: {mtd} → {goal}.',
    'Ogni recensione aiuta. {mtd} MTD: spingiamo ancora.',
    'Sei più vicino di quanto pensi. {mtd} → target {goal}.',
    'Niente scuse, solo azione. {mtd} finora.',
    'Micro-ottimizzazioni, macro-risultati: {mtd} → {goal}.',
    'Continuità quotidiana: {mtd} MTD. Alziamo l’asticella.',
    'Finestra mobile: {mtd} — mantieni il ritmo verso {goal}.',
    'Bravo! {mtd} finora. Ora sprint verso {goal}.',
    'Non mollare: {mtd} è un checkpoint, non il traguardo.',
    'Focalizzati: {mtd} MTD. Prossimo milestone: {goal}.',
    'Strategia > fortuna. {mtd} oggi, rotta su {goal}.',
    'Siamo in corsa. {mtd} MTD: spingi per {goal}!',
    // Extra 20 motivational entries
    'Scrivi oggi per vendere domani. {mtd} → {goal}.',
    'Ogni pagina scritta è un passo verso {goal}.',
    'Routine > ispirazione. {mtd} finora.',
    'Piccoli progressi quotidiani battono grandi balzi sporadici. {mtd}.',
    'Cura la copertina, cura il CTR. Risultato: {mtd}.',
    'Se non misuri, non migliori. Oggi: {mtd}, obiettivo: {goal}.',
    'La costanza costruisce cataloghi: {mtd} questo mese.',
    'Credi nei dati: {pct}% del traguardo già centrato.',
    'Pazienza e disciplina: {mtd} → {goal}.',
    'I bestseller nascono dalle abitudini. {mtd} oggi.',
    'Itera velocemente: test, misura, ottimizza.',
    'Meno perfezione, più pubblicazione. {mtd}.',
    'La prossima recensione è a un capitolo di distanza.',
    'Sblocca momentum: una pubblicazione, un’ottimizzazione, ogni giorno.',
    'Sei in controllo: prezzo, pagina, parole chiave.',
    'Quando è difficile, stai crescendo. {mtd} → {goal}.',
    'La qualità segue la quantità allenata. Continua.',
    'Obiettivo chiaro, azione semplice, ripetuta.',
    'Oggi semini, domani incassi. {mtd} → {goal}.',
    'Passo costante > sprint sporadici. Avanti!'
  ], []);

  const loadMtdEUR = React.useCallback(async () => {
    // Prefer data persisted by PayoutWidget (already converted to EUR)
    try {
      const raw = localStorage.getItem('payoutWidgetRows');
      if (raw) {
        const rows = JSON.parse(raw);
        const row = Array.isArray(rows) ? rows.find(r => r?.key === curKey) : null;
        if (row && typeof row.totalEUR === 'number') {
          setMtdEUR(row.totalEUR);
          return;
        }
      }
    } catch (_) {}
    // Fallback: EUR-only query for current month
    try {
      if (!user) return;
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 1);
      const { data, error } = await supabase
        .from('kdp_entries')
        .select('income')
        .eq('user_id', user.id)
        .eq('income_currency', 'EUR')
        .gte('date', fmtYMD(from))
        .lt('date', fmtYMD(to));
      if (error) throw error;
      const sum = (data || []).reduce((acc, r) => acc + (parseFloat(r.income || 0) || 0), 0);
      setMtdEUR(sum);
    } catch (_) {}
  }, [curKey, user?.id, y, m]);

  // Try reading the total from PayoutWidget (localStorage). Fallback to Supabase EUR-only.
  const loadPayoutTotal = React.useCallback(async () => {
    try {
      const raw = localStorage.getItem('payoutWidgetRows');
      if (raw) {
        const rows = JSON.parse(raw);
        const row = Array.isArray(rows) ? rows.find(r => r?.key === targetKey) : null;
        if (row && typeof row.totalEUR === 'number') {
          setPayoutTotal(row.totalEUR);
          return;
        }
      }
    } catch (_) {}
    // Fallback: EUR only
    try {
      if (!user) return;
      const from = new Date(target.getFullYear(), target.getMonth(), 1);
      const to = new Date(target.getFullYear(), target.getMonth() + 1, 1);
      const { data, error } = await supabase
        .from('kdp_entries')
        .select('income')
        .eq('user_id', user.id)
        .eq('income_currency', 'EUR')
        .gte('date', fmtYMD(from))
        .lt('date', fmtYMD(to));
      if (error) throw error;
      const sum = (data || []).reduce((acc, r) => acc + (parseFloat(r.income || 0) || 0), 0);
      setPayoutTotal(sum);
    } catch (_) {}
  }, [targetKey, target, user?.id]);

  React.useEffect(() => {
    if (!isPayoutDay) return;
    loadPayoutTotal();
    const onUpdated = () => loadPayoutTotal();
    window.addEventListener('payoutWidgetRowsUpdated', onUpdated);
    window.addEventListener('storage', onUpdated);
    return () => {
      window.removeEventListener('payoutWidgetRowsUpdated', onUpdated);
      window.removeEventListener('storage', onUpdated);
    };
  }, [isPayoutDay, loadPayoutTotal]);

  // Load MTD on mount and when rows update
  React.useEffect(() => {
    loadMtdEUR();
    const onUpdated = () => loadMtdEUR();
    window.addEventListener('payoutWidgetRowsUpdated', onUpdated);
    window.addEventListener('storage', onUpdated);
    return () => {
      window.removeEventListener('payoutWidgetRowsUpdated', onUpdated);
      window.removeEventListener('storage', onUpdated);
    };
  }, [loadMtdEUR]);

  React.useEffect(() => {
    if (!isPayoutDay) return;
    const id = setInterval(() => setQuoteStep(s => s + 1), 300000); // 5 min
    return () => clearInterval(id);
  }, [isPayoutDay]);

  // Ephemeral message scheduler on regular days: 10–15 random messages/day, 10–15s display, 10–15 min apart
  const timersRef = React.useRef({ show: null, hide: null });
  const clearTimers = React.useCallback(() => {
    if (timersRef.current.show) { clearTimeout(timersRef.current.show); timersRef.current.show = null; }
    if (timersRef.current.hide) { clearTimeout(timersRef.current.hide); timersRef.current.hide = null; }
  }, []);

  // Pick a unique index for the day; avoid repeats until pool exhausted
  const pickUniqueIndex = React.useCallback((poolLen, storageKey, prev) => {
    try {
      let used = [];
      try { used = JSON.parse(localStorage.getItem(storageKey)) || []; } catch (_) {}
      let candidates = [];
      for (let i = 0; i < poolLen; i++) if (!used.includes(i)) candidates.push(i);
      if (candidates.length === 0) { used = []; candidates = Array.from({ length: poolLen }, (_, i) => i); }
      let idx = candidates[Math.floor(Math.random() * candidates.length)];
      if (idx === prev && candidates.length > 1) {
        idx = candidates[(candidates.indexOf(idx) + 1) % candidates.length];
      }
      used.push(idx);
      try { localStorage.setItem(storageKey, JSON.stringify(used)); } catch (_) {}
      return idx;
    } catch (_) {
      // fallback random
      return Math.floor(Math.random() * poolLen);
    }
  }, []);

  const scheduleNextMessage = React.useCallback(() => {
    if (isPayoutDay) return; // payout day handled separately
    if (mtdEUR == null) return; // need data to talk
    const todayKey = fmtYMD(new Date());
    let count = 0;
    try { count = Number(localStorage.getItem(`petMsgCount:${todayKey}`)) || 0; } catch (_) {}
    if (count >= 15) return; // daily cap
    const delay = 600000 + Math.floor(Math.random() * 300000); // 10–15 min
    timersRef.current.show = setTimeout(() => {
      // pick a unique message for the day
      const usedKey = `petUsedTalk:${todayKey}`;
      setTalkIdx((prev) => pickUniqueIndex(talkPool.length, usedKey, prev));
      setShowBubble(true);
      try { localStorage.setItem(`petMsgCount:${todayKey}`, String(count + 1)); } catch (_) {}
      const displayMs = 10000 + Math.floor(Math.random() * 5000); // 10–15s
      timersRef.current.hide = setTimeout(() => {
        setShowBubble(false);
        scheduleNextMessage(); // chain
      }, displayMs);
    }, delay);
  }, [isPayoutDay, mtdEUR, talkPool.length, pickUniqueIndex]);

  // Kick off scheduler when MTD becomes available and not payout day
  React.useEffect(() => {
    if (isPayoutDay) { clearTimers(); setShowBubble(false); return; }
    if (mtdEUR == null) return;
    // initial gentle delay (3–6s) before first message
    const initialDelay = 3000 + Math.floor(Math.random() * 3000);
    timersRef.current.show = setTimeout(() => {
      // immediate unique message, then schedule next
      const usedKey = `petUsedTalk:${dayKey}`;
      setTalkIdx((prev) => pickUniqueIndex(talkPool.length, usedKey, prev));
      setShowBubble(true);
      const todayKey = fmtYMD(new Date());
      try {
        const c = Number(localStorage.getItem(`petMsgCount:${todayKey}`)) || 0;
        localStorage.setItem(`petMsgCount:${todayKey}`, String(Math.min(15, c + 1)));
      } catch (_) {}
      const displayMs = 10000 + Math.floor(Math.random() * 5000);
      timersRef.current.hide = setTimeout(() => {
        setShowBubble(false);
        scheduleNextMessage();
      }, displayMs);
    }, initialDelay);
    return () => clearTimers();
  }, [isPayoutDay, mtdEUR, talkPool.length, scheduleNextMessage, clearTimers, pickUniqueIndex, dayKey]);

  return (
    <div className="fixed right-4 bottom-24 lg:bottom-8 z-50">
      <style>{`
        @keyframes petDance { 0% { transform: translateY(0) rotate(0deg);} 25% { transform: translateY(-2px) rotate(3deg);} 50% { transform: translateY(0) rotate(0deg);} 75% { transform: translateY(-2px) rotate(-3deg);} 100% { transform: translateY(0) rotate(0deg);} }
        @keyframes petBreathe { 0% { transform: translateY(0) rotate(0deg);} 50% { transform: translateY(-1px) rotate(0.4deg);} 100% { transform: translateY(0) rotate(0deg);} }
        @media (prefers-reduced-motion: reduce) { .pet-anim { animation: none !important; } }
      `}</style>
      <div
        className="relative pet-anim transform-gpu cursor-pointer"
        style={{ willChange: 'transform', animation }}
        onClick={handleDanceTrigger}
        title="Click me to dance!"
      >
        <GlobalNotificationsBell />
        {/* Help pill removed per request; access via Settings */}
        <AnimatePresence>
          {hello.show && (
            <motion.div
              key="hello-bubble"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.4 }}
              className="absolute -top-3 right-14 w-72 bg-slate-900 text-slate-100 border border-white/10 rounded-xl p-3 shadow-xl"
              aria-live="polite"
            >
              <p className="text-sm font-semibold">{hello.title}</p>
              <div className="mt-1 space-y-1">
                {(hello.lines || []).slice(0, 3).map((t, i) => (
                  <p key={i} className="text-xs text-slate-300">{t}</p>
                ))}
              </div>
            </motion.div>
          )}
          {isPayoutDay && (
            <motion.div
              key="payout-bubble"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.4 }}
              className="absolute -top-3 right-14 w-72 bg-slate-900 text-slate-100 border border-slate-700 rounded-xl p-3 shadow-xl"
              aria-live="polite"
            >
              <p className="text-xs text-slate-300">Giorno di pagamento Amazon</p>
              <p className="text-sm font-semibold mt-1">{`Mese pagato: ${target.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`}</p>
              <p className="text-sm mt-1">Totale: <span className="text-emerald-400 font-bold">{payoutTotal != null ? fmtEUR(payoutTotal) : '—'}</span></p>
              <p className="text-xs text-slate-300 mt-2 italic">“{quotes[quotesOrder[(quoteStep % (quotesOrder.length || 1))] || 0]}”</p>
            </motion.div>
          )}
          {!isPayoutDay && showReco && recommended.length > 0 && (
            <motion.div
              key="reco-bubble"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.4 }}
              className="absolute -top-3 right-14 w-72 bg-slate-900 text-slate-100 border border-slate-700 rounded-xl p-3 shadow-xl"
              aria-live="polite"
            >
              <p className="text-xs text-slate-300">Notifiche consigliate</p>
              <p className="text-sm mt-1">Hai <span className="text-emerald-400 font-bold">{recommended.length}</span> suggerimenti basati sul tuo feedback.</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { try { window.dispatchEvent(new Event('openSmartNotifications')); } catch (_) {} setShowReco(false); }}
                  className="text-[11px] text-gray-200 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded px-2 py-1"
                >Apri</button>
                <button
                  type="button"
                  onClick={() => setShowReco(false)}
                  className="text-[11px] text-gray-300 hover:text-white"
                >Nascondi</button>
              </div>
            </motion.div>
          )}
          {!isPayoutDay && !showReco && showBubble && mtdEUR != null && (
            <motion.div
              key="mtd-bubble"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, mass: 0.4 }}
              className="absolute -top-3 right-14 w-72 bg-slate-900 text-slate-100 border border-slate-700 rounded-xl p-3 shadow-xl"
              aria-live="polite"
            >
              <p className="text-xs text-slate-300">Progresso del mese</p>
              <p className="text-sm mt-1">Fino ad oggi: <span className="text-emerald-400 font-bold">{mtdEUR != null ? fmtEUR(mtdEUR) : '—'}</span></p>
              {(() => {
                const pct = mtdEUR != null ? Math.min(100, Math.round((mtdEUR / GOAL) * 100)) : null;
                const msgTemplate = talkPool[talkIdx % talkPool.length] || '';
                const msg = msgTemplate
                  .replace('{mtd}', mtdEUR != null ? fmtEUR(mtdEUR) : '—')
                  .replace('{goal}', fmtEUR(GOAL))
                  .replace('{pct}', pct != null ? String(pct) : '—');
                return <p className="text-xs text-slate-300 mt-2 italic">“{msg}”</p>;
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
;

export default NotificationPet;
