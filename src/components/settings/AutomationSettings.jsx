import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import BrandPreloader from '@/components/BrandPreloader';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

const AutomationSettings = () => {
    const { user } = useAuth();
    const [runsPerDay, setRunsPerDay] = useState(1);
    const [startHour, setStartHour] = useState(8);
    const [emailAlertRecipient, setEmailAlertRecipient] = useState('');
    const [stockAlertEnabled, setStockAlertEnabled] = useState(false);
    const [stockAlertOnChange, setStockAlertOnChange] = useState(false);
    const [bsrAlertEnabled, setBsrAlertEnabled] = useState(false);
    const [bsrAlertThresholdPct, setBsrAlertThresholdPct] = useState(20);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTestingEmail, setIsTestingEmail] = useState(false);

    const frequencyMap = { 0: 1, 1: 2, 2: 4, 3: 6 };
    const valueMap = { 1: 0, 2: 1, 4: 2, 6: 3 };

    const fetchSettings = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        const { data, error } = await supabase
            .from('settings')
            .select('scraping_interval, scraping_start_hour, email_alert_recipient, stock_alert_enabled, stock_alert_on_change, bsr_alert_enabled, bsr_alert_threshold_pct')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            toast({ title: "Errore nel caricare le impostazioni", description: error.message, variant: 'destructive' });
        } else if (data) {
            setRunsPerDay(parseInt(data.scraping_interval, 10) || 1);
            setStartHour(data.scraping_start_hour || 8);
            setEmailAlertRecipient(String(data.email_alert_recipient || ''));
            setStockAlertEnabled(!!data.stock_alert_enabled);
            setStockAlertOnChange(!!data.stock_alert_on_change);
            setBsrAlertEnabled(!!data.bsr_alert_enabled);
            setBsrAlertThresholdPct(Number.isFinite(Number(data.bsr_alert_threshold_pct)) ? Number(data.bsr_alert_threshold_pct) : 20);
        }
        setIsLoading(false);
    }, [user]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleFrequencyChange = (value) => {
        setRunsPerDay(frequencyMap[value[0]]);
    };

    const handleSaveSettings = async () => {
        setIsSaving(true);

        const recipientTrim = String(emailAlertRecipient || '').trim();
        if (recipientTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientTrim)) {
            toast({ title: "Email non valida", description: "Inserisci una email valida oppure lascia vuoto.", variant: 'destructive' });
            setIsSaving(false);
            return;
        }

        const { error } = await supabase
            .from('settings')
            .upsert({
                user_id: user.id,
                scraping_interval: runsPerDay.toString(),
                scraping_start_hour: startHour,
                email_alert_recipient: recipientTrim || null,
                stock_alert_enabled: stockAlertEnabled,
                stock_alert_on_change: stockAlertOnChange,
                bsr_alert_enabled: bsrAlertEnabled,
                bsr_alert_threshold_pct: Number.isFinite(Number(bsrAlertThresholdPct)) ? Number(bsrAlertThresholdPct) : 20,
            }, { onConflict: 'user_id' });

        if (error) {
            toast({ title: "Errore nel salvare le impostazioni", description: error.message, variant: 'destructive' });
        } else {
            toast({ title: "Impostazioni Salvate!", description: `Lo scraping automatico partirà alle ${startHour}:00 e verrà eseguito ${runsPerDay} volte al giorno.` });
        }
        setIsSaving(false);
    };

    const handleSendTestEmail = async () => {
        try {
            setIsTestingEmail(true);
            const recipientTrim = String(emailAlertRecipient || '').trim();
            if (recipientTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientTrim)) {
                toast({ title: 'Test email fallito', description: 'Email destinatario non valida.', variant: 'destructive' });
                return;
            }
            const effectiveRecipient = recipientTrim || user?.email || '';
            const { error } = await supabase.functions.invoke('send_test_email', { body: { toEmail: recipientTrim || undefined } });
            if (error) {
                toast({ title: 'Test email fallito', description: error.message, variant: 'destructive' });
            } else {
                toast({ title: 'Email di test inviata', description: `Controlla la casella: ${effectiveRecipient}` });
            }
        } catch (e) {
            toast({ title: 'Test email fallito', description: String(e?.message || e), variant: 'destructive' });
        } finally {
            setIsTestingEmail(false);
        }
    };
    
    if (isLoading) {
        return <div className="flex justify-center p-8"><BrandPreloader size={64} /></div>;
    }

    return (
        <div className="glass-card p-8 max-w-4xl mx-auto mt-8">
            <h2 className="text-2xl font-semibold text-foreground mb-6">Automazione Scraper</h2>
            <div className="space-y-8">
                <div>
                    <Label htmlFor="frequency-slider" className="flex items-center gap-2 mb-4 text-base text-muted-foreground">
                        <Bot className="w-5 h-5 text-accent" />
                        Aggiornamenti automatici al giorno
                    </Label>
                    <div className="flex items-center gap-4">
                        <Slider
                            id="frequency-slider"
                            min={0}
                            max={3}
                            step={1}
                            value={[valueMap[runsPerDay] || 0]}
                            onValueChange={handleFrequencyChange}
                            className="w-full"
                        />
                        <span className="font-bold text-lg text-primary w-12 text-center">{runsPerDay}x</span>
                    </div>
                </div>

                <div>
                    <Label htmlFor="start-hour-select" className="flex items-center gap-2 mb-4 text-base text-muted-foreground">
                        <Clock className="w-5 h-5 text-accent" />
                        Orario di inizio del primo scraping (UTC)
                    </Label>
                     <Select value={startHour.toString()} onValueChange={(value) => setStartHour(parseInt(value))}>
                        <SelectTrigger className="w-[180px] glass-input">
                            <SelectValue placeholder="Seleziona orario" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                    {i.toString().padStart(2, '0')}:00 UTC
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label className="flex items-center gap-2 mb-2 text-base text-muted-foreground">
                        Conferme via Email
                    </Label>
                    <p className="text-sm text-muted-foreground mb-4">
                        Le email vengono inviate a: <span className="font-semibold text-foreground">{String(emailAlertRecipient || '').trim() || user?.email || '—'}</span>
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px] items-center gap-3 mb-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">Email destinatario (opzionale)</p>
                            <p className="text-xs text-muted-foreground">Se vuoto, useremo la tua email account.</p>
                        </div>
                        <Input
                            type="email"
                            inputMode="email"
                            value={emailAlertRecipient}
                            onChange={(e) => setEmailAlertRecipient(e.target.value)}
                            placeholder="es. nome@gmail.com"
                            className="glass-input"
                        />
                    </div>

                    <div className="flex justify-end mb-4">
                        <Button onClick={handleSendTestEmail} disabled={isTestingEmail} variant="secondary">
                            {isTestingEmail ? <BrandPreloader size={18} className="mr-2" /> : null}
                            Invia Email di Test
                        </Button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Stock (Out of stock)</p>
                                <p className="text-xs text-muted-foreground">Invia una email quando un ASIN va fuori stock.</p>
                            </div>
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border border-input bg-background"
                                checked={stockAlertEnabled}
                                onChange={(e) => setStockAlertEnabled(e.target.checked)}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Stock (Qualsiasi cambio)</p>
                                <p className="text-xs text-muted-foreground">Invia una email per ogni cambio di disponibilità.</p>
                            </div>
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border border-input bg-background"
                                checked={stockAlertOnChange}
                                onChange={(e) => setStockAlertOnChange(e.target.checked)}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">BSR variazione %</p>
                                <p className="text-xs text-muted-foreground">Invia una email quando il BSR cambia oltre una soglia.</p>
                            </div>
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border border-input bg-background"
                                checked={bsrAlertEnabled}
                                onChange={(e) => setBsrAlertEnabled(e.target.checked)}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] items-center gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">Soglia BSR (%)</p>
                                <p className="text-xs text-muted-foreground">Esempio: 20 = email se il BSR cambia di ±20% o più.</p>
                            </div>
                            <Input
                                type="number"
                                inputMode="decimal"
                                min={1}
                                step={1}
                                value={bsrAlertThresholdPct}
                                onChange={(e) => setBsrAlertThresholdPct(e.target.value)}
                                className="glass-input"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-end">
                    <Button onClick={handleSaveSettings} disabled={isSaving}>
                        {isSaving ? <BrandPreloader size={18} className="mr-2" /> : null}
                        Salva Impostazioni
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default AutomationSettings;