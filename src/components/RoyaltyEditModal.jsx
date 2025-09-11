import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Info, TrendingUp, Calendar, BarChart2 } from 'lucide-react';
import { calculateSalesFromBsr, calculateIncome } from '@/lib/incomeCalculator';
import { estimateRoyalty, explainRoyalty } from '@/lib/royaltyEstimator';

const RoyaltyEditModal = ({ asinData, isOpen, onClose, onRoyaltyUpdate }) => {
  const [royalty, setRoyalty] = useState('');
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const [isSaving, setIsSaving] = useState(false);
  // New attributes for accurate royalty: interior, pages, dimensions
  const [interiorType, setInteriorType] = useState('bw'); // 'bw' | 'color' | 'premium'
  const [pageCount, setPageCount] = useState('');
  const [dimensionsRaw, setDimensionsRaw] = useState('');
  const [trimSize, setTrimSize] = useState('');

  useEffect(() => {
    if (asinData) {
      const hasManual = typeof asinData.royalty === 'number' && asinData.royalty > 0;
      setMode(hasManual ? 'manual' : 'auto');
      setRoyalty(hasManual ? asinData.royalty : '');
      setInteriorType(asinData?.interior_type || 'bw');
      setPageCount(Number.isFinite(asinData?.page_count) ? String(asinData.page_count) : '');
      setDimensionsRaw(asinData?.dimensions_raw || '');
      setTrimSize(asinData?.trim_size || '');
    }
  }, [asinData]);

  // Helpers
  const parseTrimSize = (raw) => {
    if (!raw) return '';
    try {
      const s = String(raw).toLowerCase();
      // Try inches pattern: e.g., "8.5 x 11 in" or "8.5 x 11 inches"
      let m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:in|inch|inches)/i);
      if (m) {
        const w = parseFloat(m[1].replace(',', '.'));
        const h = parseFloat(m[2].replace(',', '.'));
        return normalizeTrim(w, h, 'in');
      }
      // Try cm pattern: e.g., "15.24 x 22.86 cm"
      m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)\s*cm/i);
      if (m) {
        const wc = parseFloat(m[1].replace(',', '.'));
        const hc = parseFloat(m[2].replace(',', '.'));
        // Convert to inches
        const w = wc / 2.54;
        const h = hc / 2.54;
        return normalizeTrim(w, h, 'in');
      }
    } catch (_) {}
    return '';
  };

  const handleSaveWithAttributes = async () => {
    if (!asinData) return;
    setIsSaving(true);
    try {
      const royaltyValue = parseFloat(royalty.toString().replace(',', '.'));
      const payload = {
        royalty: mode === 'auto' ? null : (Number.isFinite(royaltyValue) ? royaltyValue : null),
        interior_type: interiorType || null,
        page_count: Number.isFinite(Number(pageCount)) ? Number(pageCount) : null,
        dimensions_raw: dimensionsRaw || null,
        trim_size: trimSize || (dimensionsRaw ? parseTrimSize(dimensionsRaw) : null),
      };
      const { data, error } = await supabase
        .from('asin_data')
        .update(payload)
        .eq('id', asinData.id)
        .select()
        .single();
      if (error) throw error;
      toast({ title: 'Salvato!', description: 'Dettagli libro e royalty aggiornati.' });
      onRoyaltyUpdate?.(data);
      onClose();
    } catch (e) {
      const msg = String(e?.message || e);
      // Fallback: if columns don't exist yet, try legacy save
      if (/column .* does not exist/i.test(msg)) {
        await handleSave();
        toast({ title: 'Schema non aggiornato', description: 'Alcuni attributi non sono stati salvati. Applica la migrazione in supabase/migrations per abilitarli.', variant: 'destructive' });
      } else {
        toast({ title: 'Errore di salvataggio', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const normalizeTrim = (wIn, hIn) => {
    const std = [
      { w: 6.0, h: 9.0, label: '6 × 9 in' },
      { w: 8.5, h: 11.0, label: '8.5 × 11 in' },
      { w: 8.0, h: 10.0, label: '8 × 10 in' },
      { w: 5.0, h: 8.0, label: '5 × 8 in' },
      { w: 5.5, h: 8.5, label: '5.5 × 8.5 in' },
      { w: 7.5, h: 9.25, label: '7.5 × 9.25 in' },
    ];
    const tol = 0.12; // ~3mm tolerance
    for (const s of std) {
      if (Math.abs(wIn - s.w) <= tol && Math.abs(hIn - s.h) <= tol) return s.label;
      if (Math.abs(wIn - s.h) <= tol && Math.abs(hIn - s.w) <= tol) return `${s.label}`; // swapped
    }
    return `${wIn.toFixed(2)} × ${hIn.toFixed(2)} in`;
  };

  const detectInterior = () => {
    // Simple heuristic: keywords in title and price/page ratio thresholds
    const title = (asinData?.title || '').toLowerCase();
    const price = Number(asinData?.price) || 0;
    const pages = Number(pageCount) || 0;
    const ratio = pages > 0 ? price / pages : 0;
    const kwColor = /(full\s*color|a\s*colori|colou?r(\b|\s)|illustrated|photo\s*book)/i.test(title);
    // Very rough thresholds; user can override
    if (kwColor || ratio >= 0.18) return setInteriorType('premium');
    if (ratio >= 0.10) return setInteriorType('color');
    return setInteriorType('bw');
  };

  const handleSave = async () => {
    if (!asinData) return;

    const royaltyValue = parseFloat(royalty.toString().replace(',', '.'));
    if (mode === 'manual') {
      if (isNaN(royaltyValue) || royaltyValue < 0) {
        toast({
          title: 'Valore non valido',
          description: 'Per favore, inserisci un importo di royalty valido.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSaving(true);
    const { data, error } = await supabase
      .from('asin_data')
      .update({ royalty: mode === 'auto' ? null : royaltyValue })
      .eq('id', asinData.id)
      .select()
      .single();

    if (error) {
      toast({
        title: 'Errore nel salvataggio',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Royalty salvata!',
        description: `Le royalty per ${data.title} sono state aggiornate.`,
      });
      onRoyaltyUpdate(data);
      onClose();
    }
    setIsSaving(false);
  };

  if (!asinData) return null;

  const sales = calculateSalesFromBsr(asinData.bsr);
  const royaltyValue = parseFloat(royalty.toString().replace(',', '.')) || 0;
  // Use local overrides for preview
  const autoInfo = explainRoyalty({
    ...asinData,
    page_count: Number(pageCount) || asinData?.page_count,
    interior_type: interiorType || asinData?.interior_type || 'bw',
  });
  const effectiveRoyalty = mode === 'auto' ? autoInfo.netRoyalty : royaltyValue;
  const income = calculateIncome(sales, effectiveRoyalty);

  const formatRange = (range) => `${range[0]} - ${range[1]}`;
  const formatIncomeRange = (range) => `$${range[0].toFixed(2)} - $${range[1].toFixed(2)}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[94vw] sm:max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700 text-white p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Modifica Royalty per "{asinData.title}"</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Inserisci le royalty per calcolare i guadagni stimati basati sul BSR attuale.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* New: Book attributes used in printing costs */}
          <div className="bg-slate-800/50 p-3 sm:p-4 rounded-lg border border-white/10 space-y-3">
            <h4 className="text-sm sm:text-md font-semibold text-white">Dettagli libro</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-gray-400">Tipo interno</Label>
                <div className="flex gap-1 mt-1">
                  <button type="button" onClick={()=>setInteriorType('bw')} className={`px-2 py-1 rounded border text-xs ${interiorType==='bw'?'border-emerald-400 text-white':'border-white/10 text-gray-300'}`}>B/N</button>
                  <button type="button" onClick={()=>setInteriorType('color')} className={`px-2 py-1 rounded border text-xs ${interiorType==='color'?'border-emerald-400 text-white':'border-white/10 text-gray-300'}`}>Colore</button>
                  <button type="button" onClick={()=>setInteriorType('premium')} className={`px-2 py-1 rounded border text-xs ${interiorType==='premium'?'border-emerald-400 text-white':'border-white/10 text-gray-300'}`}>Premium</button>
                  <button type="button" onClick={detectInterior} className="ml-auto px-2 py-1 rounded border border-white/10 text-xs text-gray-200">Rileva</button>
                </div>
              </div>
              <div>
                <Label htmlFor="pageCount" className="text-xs text-gray-400">Pagine</Label>
                <Input id="pageCount" type="number" min="24" max="828" value={pageCount} onChange={(e)=> setPageCount(e.target.value)} className="bg-slate-800 border-slate-600 h-9 text-sm mt-1" placeholder="Es. 120" />
              </div>
              <div>
                <Label htmlFor="dimensions" className="text-xs text-gray-400">Dimensioni (come su Amazon)</Label>
                <Input id="dimensions" type="text" value={dimensionsRaw} onChange={(e)=> { setDimensionsRaw(e.target.value); setTrimSize(parseTrimSize(e.target.value)); }} className="bg-slate-800 border-slate-600 h-9 text-sm mt-1" placeholder="Es. 6 x 9 inches / 15.24 x 22.86 cm" />
                {trimSize && <p className="text-[11px] text-gray-400 mt-1">Formato: <span className="text-gray-200">{trimSize}</span></p>}
              </div>
            </div>
            <p className="text-[11px] text-gray-500">Questi dettagli migliorano l'accuratezza del costo stampa. Il calcolo usa <span className="text-gray-300">{interiorType.toUpperCase()}</span> e {Number(pageCount)||asinData?.page_count||'—'} pagine.</p>
          </div>
          {/* Mode selector */}
          <div className="flex items-center gap-3">
            <Label className="text-sm">Modalità</Label>
            <div className="inline-flex rounded-md overflow-hidden border border-slate-700">
              <button type="button" onClick={() => setMode('auto')} className={`px-3 py-1 text-sm ${mode==='auto' ? 'bg-emerald-600/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>Automatica</button>
              <button type="button" onClick={() => setMode('manual')} className={`px-3 py-1 text-sm ${mode==='manual' ? 'bg-purple-600/20 text-purple-300' : 'bg-slate-800 text-slate-300'}`}>Manuale</button>
            </div>
          </div>

          {mode === 'manual' ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3 sm:gap-4">
              <Label htmlFor="royalty" className="text-left sm:text-right text-sm">
                Royalty ($)
              </Label>
              <Input
                id="royalty"
                type="text"
                value={royalty}
                onChange={(e) => setRoyalty(e.target.value)}
                className="sm:col-span-3 bg-slate-800 border-slate-600 focus:ring-purple-500 h-9 text-sm"
                placeholder="Es. 2,45"
              />
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-white/10 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-300 mb-2"><Info className="w-4 h-4"/> Royalty rilevata automaticamente</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-slate-200">
                <div>
                  <p className="text-slate-400 text-xs">Prezzo (lordo)</p>
                  <p>${autoInfo.price.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">IVA applicata ({(autoInfo.vatRate*100).toFixed(1)}%)</p>
                  <p>${(autoInfo.price - autoInfo.basePrice).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Prezzo (netto IVA)</p>
                  <p>${autoInfo.basePrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Quota Amazon (60%)</p>
                  <p>${autoInfo.grossRoyalty.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Costo stampa fisso</p>
                  <p>${autoInfo.print.fixed.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Costo per pagina × {autoInfo.pages}</p>
                  <p>${autoInfo.print.perPageCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Costo stampa totale</p>
                  <p>${autoInfo.print.total.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Interno usato</p>
                  <p className="uppercase">{autoInfo.interior}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Royalty stimata per copia</p>
                  <p className="text-emerald-300 font-semibold">${autoInfo.netRoyalty.toFixed(2)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Puoi passare alla modalità manuale per sovrascrivere il valore.</p>
            </div>
          )}

          <div className="bg-slate-800/50 p-3 sm:p-4 rounded-lg border border-white/10 space-y-3 sm:space-y-4">
              <h4 className="text-sm sm:text-md font-semibold text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-400" /> Stima Guadagni</h4>
              <p className="text-xs sm:text-sm text-gray-400">
                  Questa stima si basa sul BSR attuale di <strong className="text-purple-400">{asinData.bsr?.toLocaleString('it-IT') || 'N/D'}</strong>.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <div className="bg-white/5 p-3 rounded-md">
                      <p className="flex items-center gap-2 text-gray-400"><TrendingUp className="w-4 h-4"/> Vendite Stimate</p>
                      <p className="text-white font-semibold">Giorno: {formatRange(sales.daily)}</p>
                      <p className="text-white font-semibold">Mese: {formatRange(sales.monthly)}</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-md">
                      <p className="flex items-center gap-2 text-gray-400"><BarChart2 className="w-4 h-4"/> Guadagno Stimato</p>
                      <p className="text-green-400 font-semibold">Giorno: {formatIncomeRange(income.daily)}</p>
                      <p className="text-green-400 font-semibold">Mese: {formatIncomeRange(income.monthly)}</p>
                      <p className="text-xs text-gray-400 mt-1">Calcolato con royalty {mode === 'auto' ? 'automatica' : 'manuale'}: ${effectiveRoyalty.toFixed(2)}</p>
                  </div>
              </div>
              <p className="text-xs text-gray-500 pt-2">
                  *I calcoli sono stime basate su dati aggregati e possono variare. Usa queste informazioni come una guida.
              </p>
          </div>
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto h-9 text-sm text-white border-slate-600 hover:bg-slate-800">Annulla</Button>
          <Button onClick={async () => {
            // Persist new attributes together with royalty mode
            await handleSaveWithAttributes();
          }} disabled={isSaving} className="w-full sm:w-auto h-9 text-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salva Royalty
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RoyaltyEditModal;