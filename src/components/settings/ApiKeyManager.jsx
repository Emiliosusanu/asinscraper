import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Loader2, Plus, Trash2, RefreshCw, Edit, Save, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ApiKeyLogModal from '@/components/settings/ApiKeyLogModal';

const ApiKeyManager = () => {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState([]);
  const [newApiKey, setNewApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [logModalKey, setLogModalKey] = useState(null);

  const fetchApiKeys = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('scraper_api_keys')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Errore nel caricare le chiavi API', description: error.message, variant: 'destructive' });
    } else {
      setApiKeys(data.map(k => ({ ...k, isEditing: false, tempMaxCredits: k.max_credits, tempCostPerCall: k.cost_per_call })));
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handleAddApiKey = async () => {
    if (!newApiKey.trim()) {
      toast({ title: 'Chiave API non valida', description: 'Per favore, inserisci una chiave API.', variant: 'destructive' });
      return;
    }
    setIsAdding(true);
    const { data, error } = await supabase
      .from('scraper_api_keys')
      .insert({ 
        user_id: user.id, 
        api_key: newApiKey.trim(), 
        service_name: 'scraperapi',
        status: 'active',
        credits: 1000,
        max_credits: 1000,
        cost_per_call: 1,
        success_count: 0,
        failure_count: 0,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Errore nell\'aggiungere la chiave', description: error.message, variant: 'destructive' });
    } else {
      setApiKeys(prev => [...prev, { ...data, isEditing: false, tempMaxCredits: data.max_credits, tempCostPerCall: data.cost_per_call }]);
      setNewApiKey('');
      toast({ title: 'Chiave API Aggiunta!', description: 'La nuova chiave è pronta per essere usata.' });
    }
    setIsAdding(false);
  };

  const handleDeleteApiKey = async (keyId) => {
    const { error } = await supabase
      .from('scraper_api_keys')
      .delete()
      .eq('id', keyId);

    if (error) {
      toast({ title: 'Errore nella cancellazione', description: error.message, variant: 'destructive' });
    } else {
      setApiKeys(prev => prev.filter(key => key.id !== keyId));
      toast({ title: 'Chiave API Cancellata' });
    }
  };

  const handleResetCredits = async (keyId) => {
    const { error } = await supabase.rpc('reset_scraper_api_key_credits', { p_key_id: keyId, p_user_id: user.id });
    if (error) {
      toast({ title: 'Errore nel reset', description: error.message, variant: 'destructive' });
    } else {
      fetchApiKeys();
      toast({ title: 'Crediti Resettati!', description: 'I crediti per la chiave sono stati ripristinati.' });
    }
  };

  const handleUpdateKey = async (keyId) => {
    const keyToUpdate = apiKeys.find(k => k.id === keyId);
    const { error } = await supabase
      .from('scraper_api_keys')
      .update({ max_credits: keyToUpdate.tempMaxCredits, cost_per_call: keyToUpdate.tempCostPerCall })
      .eq('id', keyId);
    
    if (error) {
      toast({ title: 'Errore nell\'aggiornamento', description: error.message, variant: 'destructive' });
    } else {
      setEditingKey(null);
      fetchApiKeys();
      toast({ title: 'Chiave Aggiornata!' });
    }
  };

  const handleInputChange = (keyId, field, value) => {
    setApiKeys(keys => keys.map(k => k.id === keyId ? { ...k, [field]: value } : k));
  };

  const getStatusPill = (status) => {
    switch (status) {
      case 'active': return <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-300">Attiva</span>;
      case 'inactive': return <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">Inattiva</span>;
      case 'exhausted': return <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-300">Esaurita</span>;
      default: return <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400">{status}</span>;
    }
  };

  return (
    <div className="glass-card p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-foreground mb-6">Gestione Chiavi ScraperAPI</h2>
      
      <div className="space-y-4 mb-6">
        <Label htmlFor="newApiKey" className="block text-sm font-medium text-muted-foreground mb-2">Aggiungi Nuova Chiave API</Label>
        <div className="flex gap-2">
          <div className="relative flex-grow">
            <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input id="newApiKey" type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder="Incolla qui la tua nuova chiave..." className="w-full pl-12 pr-4 py-3 glass-input" />
          </div>
          <Button onClick={handleAddApiKey} className="bg-primary text-primary-foreground" disabled={isAdding}>
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-4">Le Tue Chiavi</h3>
      {isLoading ? (
        <div className="flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <ul className="space-y-3">
          {apiKeys.map(key => (
            <motion.li key={key.id} layout className="flex flex-col bg-muted/30 p-4 rounded-lg gap-4 border border-border">
              <div className="flex flex-wrap items-center justify-between w-full gap-4">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-accent" />
                  <span className="font-mono text-muted-foreground">••••••••{key.api_key.slice(-4)}</span>
                  {getStatusPill(key.status)}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setLogModalKey(key)}><History className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingKey(editingKey === key.id ? null : key.id)}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleResetCredits(key.id)}><RefreshCw className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDeleteApiKey(key.id)} className="text-destructive/70 hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <AnimatePresence>
                {editingKey === key.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border">
                      <div>
                        <Label htmlFor={`max-credits-${key.id}`} className="text-xs">Crediti Massimi</Label>
                        <Input id={`max-credits-${key.id}`} type="number" value={key.tempMaxCredits} onChange={(e) => handleInputChange(key.id, 'tempMaxCredits', parseInt(e.target.value))} className="glass-input mt-1" />
                      </div>
                      <div>
                        <Label htmlFor={`cost-${key.id}`} className="text-xs">Costo per Chiamata</Label>
                        <Input id={`cost-${key.id}`} type="number" value={key.tempCostPerCall} onChange={(e) => handleInputChange(key.id, 'tempCostPerCall', parseInt(e.target.value))} className="glass-input mt-1" />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <Button size="sm" onClick={() => handleUpdateKey(key.id)}><Save className="w-4 h-4 mr-2" />Salva Modifiche</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
                <div className="text-sm text-muted-foreground">Crediti: <span className="font-semibold text-foreground">{key.credits}/{key.max_credits}</span></div>
                <div className="text-sm text-muted-foreground">Successi: <span className="font-semibold text-green-400">{key.success_count}</span></div>
                <div className="text-sm text-muted-foreground">Fallimenti: <span className="font-semibold text-red-400">{key.failure_count}</span></div>
              </div>
            </motion.li>
          ))}
          {apiKeys.length === 0 && <p className="text-center text-muted-foreground py-4">Nessuna chiave API trovata.</p>}
        </ul>
      )}
      {logModalKey && <ApiKeyLogModal apiKey={logModalKey} isOpen={!!logModalKey} onClose={() => setLogModalKey(null)} />}
    </div>
  );
};

export default ApiKeyManager;