import { createBrowserClient } from '@supabase/ssr';
export const configured=!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const demo=process.env.NEXT_PUBLIC_DEMO_MODE==='true';
export function browserClient(){if(!configured)throw new Error('Fieldnote is not connected yet.');return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);}
