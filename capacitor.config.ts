import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.emilianu.kdpinsights',
  appName: 'KDP Insights',
  webDir: 'dist',
  server: {
    url: 'https://asinscraper.vercel.app',
    cleartext: false
  }
};

export default config;
