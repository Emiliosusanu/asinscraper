import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Label } from '@/components/ui/label';
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
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const frequencyMap = { 0: 1, 1: 2, 2: 4, 3: 6 };
    const valueMap = { 1: 0, 2: 1, 4: 2, 6: 3 };

    const fetchSettings = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        const { data, error } = await supabase
            .from('settings')
            .select('scraping_interval, scraping_start_hour')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            toast({ title: "Errore nel caricare le impostazioni", description: error.message, variant: 'destructive' });
        } else if (data) {
            setRunsPerDay(parseInt(data.scraping_interval, 10) || 1);
            setStartHour(data.scraping_start_hour || 8);
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
        const { error } = await supabase
            .from('settings')
            .update({ 
                scraping_interval: runsPerDay.toString(),
                scraping_start_hour: startHour 
            })
            .eq('user_id', user.id);

        if (error) {
            toast({ title: "Errore nel salvare le impostazioni", description: error.message, variant: 'destructive' });
        } else {
            toast({ title: "Impostazioni Salvate!", description: `Lo scraping automatico partirà alle ${startHour}:00 e verrà eseguito ${runsPerDay} volte al giorno.` });
        }
        setIsSaving(false);
    };
    
    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
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
                
                <div className="flex justify-end">
                    <Button onClick={handleSaveSettings} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Salva Impostazioni
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default AutomationSettings;