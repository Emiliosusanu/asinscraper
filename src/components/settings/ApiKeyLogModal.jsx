import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const ApiKeyLogModal = ({ apiKey, isOpen, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!apiKey) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from('scraper_api_logs')
        .select('*')
        .eq('api_key_id', apiKey.id)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        toast({ title: 'Errore nel caricare i log', description: error.message, variant: 'destructive' });
      } else {
        setLogs(data);
      }
      setIsLoading(false);
    };
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, apiKey]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl glass-card text-white">
        <DialogHeader>
          <DialogTitle>Log Utilizzo API</DialogTitle>
          <DialogDescription>
            Visualizza le ultime 100 chiamate effettuate con la chiave ••••••••{apiKey?.api_key.slice(-4)}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className={`p-3 rounded-md text-sm ${log.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <div className="flex justify-between items-center">
                    <div className="font-mono">
                      <span className="font-bold">{log.asin}</span> ({log.country})
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div className={`font-semibold ${log.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>{log.status}</div>
                    <div>Costo: <span className="font-bold">{log.cost}</span> crediti</div>
                  </div>
                  {log.error_message && <p className="text-xs text-red-300 mt-1 truncate">Errore: {log.error_message}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nessun log trovato per questa chiave.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApiKeyLogModal;