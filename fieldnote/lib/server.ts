import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
export function admin(){if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Server connection is not configured.');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function session(){const jar=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:(items)=>{try{items.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* Server components cannot write cookies. */}}}});}
export async function identity(){const client=await session();const {data:{user}}=await client.auth.getUser();if(!user?.email_confirmed_at)throw new Error('Please sign in with a confirmed email address.');return {client,user};}
