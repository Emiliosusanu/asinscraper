/// <reference types="vite/client" />

// Allow using import.meta.env in TSX files without tsconfig setup
interface ImportMetaEnv {
  readonly VITE_NOTIFICATIONS_V1?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Shims for JS modules without type declarations
declare module '@/components/ui/dialog' {
  import * as React from 'react';
  export const Dialog: React.FC<any>;
  export const DialogPortal: React.FC<any>;
  export const DialogOverlay: React.FC<any>;
  export const DialogTrigger: React.FC<any>;
  export const DialogClose: React.FC<any>;
  export const DialogContent: React.FC<any>;
  export const DialogHeader: React.FC<any>;
  export const DialogFooter: React.FC<any>;
  export const DialogTitle: React.FC<any>;
  export const DialogDescription: React.FC<any>;
}

declare module '@/components/ui/button' {
  import * as React from 'react';
  export const Button: React.FC<any>;
}

declare module '@/contexts/SupabaseAuthContext' {
  export const useAuth: () => { user: any; loading: boolean };
}

declare module '@/lib/customSupabaseClient' {
  export const supabase: any;
}
