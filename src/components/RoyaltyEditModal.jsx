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

  useEffect(() => {
    if (asinData) {
      const hasManual = typeof asinData.royalty === 'number' && asinData.royalty > 0;
      setMode(hasManual ? 'manual' : 'auto');
      setRoyalty(hasManual ? asinData.royalty : '');
    }
  }, [asinData]);

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
  const autoInfo = explainRoyalty(asinData);
  const effectiveRoyalty = mode === 'auto' ? autoInfo.netRoyalty : royaltyValue;
  const income = calculateIncome(sales, effectiveRoyalty);

  const formatRange = (range) => `${range[0]} - ${range[1]}`;
  const formatIncomeRange = (range) => `$${range[0].toFixed(2)} - $${range[1].toFixed(2)}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Modifica Royalty per "{asinData.title}"</DialogTitle>
          <DialogDescription>
            Inserisci le royalty per calcolare i guadagni stimati basati sul BSR attuale.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* Mode selector */}
          <div className="flex items-center gap-3">
            <Label className="text-sm">Modalità</Label>
            <div className="inline-flex rounded-md overflow-hidden border border-slate-700">
              <button type="button" onClick={() => setMode('auto')} className={`px-3 py-1 text-sm ${mode==='auto' ? 'bg-emerald-600/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>Automatica</button>
              <button type="button" onClick={() => setMode('manual')} className={`px-3 py-1 text-sm ${mode==='manual' ? 'bg-purple-600/20 text-purple-300' : 'bg-slate-800 text-slate-300'}`}>Manuale</button>
            </div>
          </div>

          {mode === 'manual' ? (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="royalty" className="text-right">
                Royalty ($)
              </Label>
              <Input
                id="royalty"
                type="text"
                value={royalty}
                onChange={(e) => setRoyalty(e.target.value)}
                className="col-span-3 bg-slate-800 border-slate-600 focus:ring-purple-500"
                placeholder="Es. 2,45"
              />
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-white/10 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-300 mb-2"><Info className="w-4 h-4"/> Royalty rilevata automaticamente</div>
              <div className="grid grid-cols-2 gap-2 text-slate-200">
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
                  <p className="text-slate-400 text-xs">Royalty stimata per copia</p>
                  <p className="text-emerald-300 font-semibold">${autoInfo.netRoyalty.toFixed(2)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Puoi passare alla modalità manuale per sovrascrivere il valore.</p>
            </div>
          )}

          <div className="bg-slate-800/50 p-4 rounded-lg border border-white/10 space-y-4">
              <h4 className="text-md font-semibold text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-400" /> Stima Guadagni</h4>
              <p className="text-sm text-gray-400">
                  Questa stima si basa sul BSR attuale di <strong className="text-purple-400">{asinData.bsr?.toLocaleString('it-IT') || 'N/D'}</strong>.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-white border-slate-600 hover:bg-slate-800">Annulla</Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salva Royalty
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RoyaltyEditModal;