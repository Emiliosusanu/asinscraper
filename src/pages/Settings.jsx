import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ApiKeyManager from '@/components/settings/ApiKeyManager';
import AutomationSettings from '@/components/settings/AutomationSettings';

const Settings = () => {
  return (
    <>
      <Helmet>
        <title>Impostazioni - KDP Insights Pro</title>
        <meta name="description" content="Gestisci le impostazioni della tua applicazione, le chiavi API e l'automazione." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pb-20 lg:pb-0"
      >
        <div className="flex items-center gap-4 mb-8">
          <SettingsIcon className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-4xl font-bold text-foreground">Impostazioni</h1>
            <p className="text-lg text-muted-foreground">Gestisci le configurazioni della tua applicazione e API.</p>
          </div>
        </div>
        {/* Novità & Guida Rapida */}
        <div className="glass-card p-6 mb-8 border border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">Novità & Guida Rapida</h2>
                <p className="text-sm text-muted-foreground">Apri il tutorial e le ultime novità dell'app.</p>
              </div>
            </div>
            <Button
              onClick={() => {
                try { window.dispatchEvent(new CustomEvent('openWelcomeModal', { detail: { suppressCount: true } })); }
                catch (_) { window.dispatchEvent(new Event('openWelcomeModal')); }
              }}
            >
              Apri Guida
            </Button>
          </div>
        </div>

        <ApiKeyManager />
        <AutomationSettings />
      </motion.div>
    </>
  );
};

export default Settings;