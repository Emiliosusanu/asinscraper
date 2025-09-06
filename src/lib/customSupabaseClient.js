import { createClient } from '@supabase/supabase-js';

const isProd = import.meta.env.PROD;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (!isProd ? 'https://fbhhhtvksyeyaoffwwgr.supabase.co' : undefined);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (!isProd ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiaGhodHZrc3lleWFvZmZ3d2dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxODM3NjYsImV4cCI6MjA2MTc1OTc2Nn0.3BSlYtb-dko_09fVLxuDVFtqGpB2q80xJXIfnSm4bJ8' : undefined);

if (isProd && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in production build');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);