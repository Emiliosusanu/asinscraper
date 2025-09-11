import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Info, Sparkles, BookOpenCheck, Settings as SettingsIcon, Rocket, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const STORAGE_KEY = 'welcome_changelog_v2';

const WelcomeChangelogModal = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(2);
  const [suppressCount, setSuppressCount] = useState(false); // for manual opens via help button
  const [isSmall, setIsSmall] = useState(false);

  const getKey = useCallback(() => {
    const uid = user?.id || 'anon';
    return `${STORAGE_KEY}:${uid}`;
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(getKey());
      const parsed = raw ? JSON.parse(raw) : null;
      const shownCount = Number(parsed?.shownCount || 0);
      setRemaining(Math.max(0, 2 - shownCount));
      if (shownCount < 2) {
        setSuppressCount(false);
        setOpen(true);
      }
    } catch (_) {
      setOpen(true);
    }
  }, [getKey, user]);

  // Track small screens to tailor collapsed sections
  useEffect(() => {
    const check = () => setIsSmall(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Allow manual open from anywhere
  useEffect(() => {
    const handler = (e) => {
      try {
        setSuppressCount(Boolean(e?.detail?.suppressCount));
      } catch (_) { setSuppressCount(true); }
      setOpen(true);
    };
    window.addEventListener('openWelcomeModal', handler);
    return () => window.removeEventListener('openWelcomeModal', handler);
  }, []);

  const persistCount = (nextCount) => {
    try {
      localStorage.setItem(getKey(), JSON.stringify({ shownCount: nextCount, ts: Date.now() }));
      setRemaining(Math.max(0, 2 - nextCount));
    } catch (_) {}
  };

  const handleClose = () => {
    try {
      if (!suppressCount) {
        const raw = localStorage.getItem(getKey());
        const parsed = raw ? JSON.parse(raw) : { shownCount: 0 };
        const next = Math.min(2, Number(parsed?.shownCount || 0) + 1);
        persistCount(next);
      }
    } catch (_) {
      if (!suppressCount) persistCount(1);
    }
    setSuppressCount(false);
    setOpen(false);
  };

  const handleDontShowAgain = () => {
    persistCount(2);
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[88vh] overflow-y-auto bg-slate-900 border-white/10 text-white p-4 sm:p-6 rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" /> Novità & Guida Rapida
          </DialogTitle>
          <DialogDescription className="leading-snug">
            Un breve riepilogo degli aggiornamenti e dei primi passi consigliati per iniziare al meglio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-6 mt-1 break-words hyphens-auto">
          <details open={!isSmall} className="rounded-md">
            <summary className="cursor-pointer select-none py-1 text-emerald-300 flex items-center gap-2 text-sm sm:text-base">
              <Rocket className="w-4 h-4"/> <span className="font-semibold">Aggiornamenti recenti</span>
            </summary>
            <div className="mt-1 sm:mt-2 space-y-2">
              <ul className="list-disc list-inside text-[13px] text-gray-200 space-y-1">
                <li>Guida ACOS migliorata: KPI, preset KDP, tooltips, pulsante Reset, adorners.</li>
                <li>Grafico trend ASIN: controlli più larghi, neon mode, rimozione artefatti.</li>
                <li>Royalties più precise: tipo interno (B/N, Colore, Premium), pagine, trim.</li>
                <li>ScraperAPI: gestione chiavi, log, e arricchimento dettagli prodotto (pagine, dimensioni, lingua...)</li>
              </ul>
            </div>
          </details>

          <details open className="rounded-md">
            <summary className="cursor-pointer select-none py-1 text-cyan-300 flex items-center gap-2 text-sm sm:text-base">
              <Info className="w-4 h-4"/> <span className="font-semibold">Tutorial passo-passo (1 minuto)</span>
            </summary>
            <div className="mt-1 sm:mt-2 space-y-2">
            <ol className="list-decimal list-inside text-[13px] text-gray-200 space-y-2 leading-snug">
              <li>
                <span className="font-medium">Ottieni la chiave ScraperAPI</span>:
                <span className="block text-gray-300 text-[13px]">
                  1) Vai su <a href="https://www.scraperapi.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">scraperapi.com</a> e crea un account (piano free disponibile). 2) Nel dashboard copia la tua <span className="font-medium text-white">API Key</span>.
                </span>
              </li>
              <li>
                <span className="font-medium">Inserisci la chiave</span> in <Link to="/settings" className="text-emerald-300 underline">Settings → Gestione Chiavi ScraperAPI</Link>:
                <span className="block text-gray-300 text-[13px]">Usa “Aggiungi Nuova Chiave API”. Puoi impostare <em>Crediti Massimi</em> e <em>Costo per Chiamata</em> (di default 1000 crediti / 5 per chiamata) e visualizzare <em>log e reset</em> mensili.</span>
              </li>
              <li>
                (Opzionale) <span className="font-medium">Automatizza lo scraping</span> in <Link to="/settings" className="text-emerald-300 underline">Settings → Automazione</Link>:
                <span className="block text-gray-300 text-[13px]">Scegli quante volte al giorno aggiornare (1–6) e l’ora di inizio (UTC). Il nostro cron eviterà esecuzioni duplicate ravvicinate.</span>
              </li>
              <li>
                <span className="font-medium">Aggiungi un ASIN</span> nella pagina <Link to="/" className="text-emerald-300 underline">Monitoraggio ASIN</Link> e seleziona il marketplace (.com, .it, ecc.).
              </li>
              <li>
                <span className="font-medium">Ottimizza</span>: apri la <span className="font-medium">Guida ACOS</span> (budget, CPC stimato, ROAS) e il <span className="font-medium">modale Royalty</span> (tipo interno, pagine, trim) per numeri 1:1 col calcolatore KDP.
              </li>
              <li>
                <span className="font-medium">Recensioni</span>: dalla card clicca l’icona messaggi per estrarre le recensioni (usa la tua chiave ScraperAPI con bilanciamento crediti/log automatico).
              </li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-2">
              <a href="https://www.scraperapi.com/" target="_blank" rel="noopener noreferrer" className="block w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto h-9 px-3 text-sm border-white/20 text-white hover:bg-white/10">Ottieni chiave ScraperAPI</Button>
              </a>
              <Link to="/settings" className="block w-full sm:w-auto">
                <Button className="w-full sm:w-auto h-9 px-3 text-sm bg-emerald-600 hover:bg-emerald-700">Apri Settings</Button>
              </Link>
            </div>
            </div>
          </details>

          <details open={!isSmall} className="rounded-md">
            <summary className="cursor-pointer select-none py-1 text-violet-300 flex items-center gap-2 text-sm sm:text-base">
              <BookOpenCheck className="w-4 h-4"/> <span className="font-semibold">Primi passi consigliati</span>
            </summary>
            <div className="mt-1 sm:mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Link to="/settings" className="block">
                <Button className="w-full h-9 px-3 text-sm bg-emerald-600 hover:bg-emerald-700"><SettingsIcon className="w-4 h-4 mr-2"/>Apri Settings</Button>
              </Link>
              <Link to="/" className="block">
                <Button variant="secondary" className="w-full h-9 px-3 text-sm">Aggiungi un ASIN</Button>
              </Link>
              <Link to="/" className="block">
                <Button variant="outline" className="w-full h-9 px-3 text-sm border-white/20 text-white hover:bg-white/10">Vedi Grafici</Button>
              </Link>
            </div>
          </details>

          <details open={!isSmall} className="rounded-md">
            <summary className="cursor-pointer select-none py-1 text-amber-300 flex items-center gap-2 text-sm sm:text-base">
              <Sparkles className="w-4 h-4"/> <span className="font-semibold">Benefici chiave</span>
            </summary>
            <div className="mt-1 sm:mt-2 space-y-2">
            <ul className="list-disc list-inside text-[13px] text-gray-200 space-y-1">
              <li><span className="font-medium text-white">Royalties precise</span>: calcolo allineato a KDP (60% ex-IVA in EU/UK, costo stampa per pagina per B/N, Colore, Premium; trim small/large).</li>
              <li><span className="font-medium text-white">Automation</span>: aggiornamenti pianificati, retry con backoff e concorrenza controllata.</li>
              <li><span className="font-medium text-white">Insights</span>: trend BSR, prezzo, recensioni, income con guardrail MoM e notifiche.</li>
              <li><span className="font-medium text-white">Recensioni</span>: estrazione puntuale con gestione crediti e log per chiave.</li>
              <li><span className="font-medium text-white">UX</span>: pulsazioni visive durante scraping e autoscroll al completamento.</li>
            </ul>
            <p className="text-[12px] text-gray-400">Le chiavi sono salvate nella tabella <span className="font-mono">scraper_api_keys</span> del tuo account e puoi rimuoverle in qualsiasi momento. Ogni utilizzo viene tracciato in <span className="font-mono">scraper_api_logs</span>.</p>
            </div>
          </details>

          <p className="text-[12px] text-gray-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> Questo messaggio verrà mostrato ancora {remaining} volta{remaining === 1 ? '' : 'e'}.</p>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 mt-2">
          <Button variant="ghost" onClick={handleDontShowAgain} className="w-full sm:w-auto h-9 px-3 text-sm text-white/80 hover:text-white hover:bg-white/10">Non mostrare più</Button>
          <Button onClick={handleClose} className="w-full sm:w-auto h-9 px-3 text-sm bg-primary text-primary-foreground hover:bg-primary/90">Inizia</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeChangelogModal;
