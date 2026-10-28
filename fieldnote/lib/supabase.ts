import { createBrowserClient } from '@supabase/ssr';
import { simulation } from './mode';
import { simulatedClient } from './simulation';
export const configured=!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const demo=simulation||process.env.NEXT_PUBLIC_DEMO_MODE==='true';
export function browserClient(){if(simulation)return simulatedClient() as unknown as ReturnType<typeof createBrowserClient>;if(!configured)throw new Error('Fieldnote is not connected yet.');return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);}
