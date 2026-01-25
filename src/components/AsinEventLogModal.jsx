import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { X, History, ShoppingCart, Star, BarChart, AlertTriangle, PlusCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import BrandPreloader from '@/components/BrandPreloader';

const eventIcons = {
  ASIN_ADDED: <PlusCircle className="w-5 h-5 text-green-400" />,
  STOCK_STATUS_CHANGED: <ShoppingCart className="w-5 h-5 text-orange-400" />,
  REVIEW_COUNT_DROPPED: <AlertTriangle className="w-5 h-5 text-red-400" />,
  PRICE_CHANGED: <BarChart className="w-5 h-5 text-blue-400" />,
  BSR_CHANGED: <BarChart className="w-5 h-5 text-purple-400" />,
  default: <History className="w-5 h-5 text-gray-400" />,
};

const formatNumber = (num) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return '—';
  return new Intl.NumberFormat('it-IT').format(Number(num));
};

const BsrChangeRow = ({ event }) => {
  const meta = event?.metadata || {};
  const prev = Number(meta.old ?? meta.from ?? meta.previous ?? meta.prev);
  const curr = Number(meta.new ?? meta.to ?? meta.current ?? meta.now);
  const valid = Number.isFinite(prev) && Number.isFinite(curr) && prev > 0 && curr > 0;
  const worse = valid ? curr > prev : false; // higher BSR is worse
  const better = valid ? curr < prev : false;
  const diff = valid ? curr - prev : null;
  const rel = valid ? ((curr - prev) / prev) * 100 : null;
  const color = better ? 'text-emerald-400' : worse ? 'text-red-400' : 'text-gray-300';
  const Icon = better ? TrendingDown : worse ? TrendingUp : BarChart;

  return (
    <div className="pl-4">
      <div className={`flex items-center gap-2 font-medium ${color}`}>
        <Icon className="w-4 h-4" />
        <span>BSR</span>
        {valid && (
          <span className="text-gray-300">{formatNumber(prev)} → </span>
        )}
        <span className={`${color} font-semibold`}>{valid ? formatNumber(curr) : '—'}</span>
      </div>
      {valid && (
        <div className="text-xs text-gray-400 mt-0.5">
          Delta: <span className={`${color} font-semibold`}>{diff > 0 ? '+' : ''}{formatNumber(diff)}{rel !== null ? ` (${rel > 0 ? '+' : ''}${rel.toFixed(1)}%)` : ''}</span>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-1">{new Date(event.created_at).toLocaleString('it-IT')}</p>
    </div>
  );
};

const AsinEventLogModal = ({ asinData, isOpen, onClose }) => {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      if (!asinData) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from('asin_events')
        .select('*')
        .eq('asin_data_id', asinData.id)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error('Error fetching events:', error);
      } else {
        setEvents(data);
      }
      setIsLoading(false);
    };

    if (isOpen) {
      fetchEvents();
    }
  }, [isOpen, asinData]);

  const getEventIcon = (eventType) => {
    return eventIcons[eventType] || eventIcons.default;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Log Eventi - {asinData?.title}</DialogTitle>
          <DialogDescription>
            Visualizza gli eventi più recenti per questo ASIN.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-1 pr-4">
          {isLoading ? (
            <div className="flex justify-center p-8"><BrandPreloader size={64} /></div>
          ) : events.length > 0 ? (
            <div className="relative pl-8">
              <div className="absolute left-[15px] top-0 h-full w-0.5 bg-border -translate-x-1/2"></div>
              {events.map(event => (
                <div key={event.id} className="relative mb-6">
                  <div className="absolute -left-8 top-1.5 flex items-center justify-center w-8 h-8 bg-slate-800 rounded-full border-2 border-slate-700">
                    {getEventIcon(event.event_type)}
                  </div>
                  {event.event_type === 'BSR_CHANGED' ? (
                    <BsrChangeRow event={event} />
                  ) : (
                    <div className="pl-4">
                      <p className="font-semibold text-foreground">{event.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString('it-IT')}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nessun evento registrato per questo ASIN.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AsinEventLogModal;