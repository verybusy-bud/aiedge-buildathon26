import 'server-only';
import Stripe from 'stripe';
import {admin,identity} from './server';
import {simulation} from './mode';
import {configuredAmount} from './commerce';
import type {BillingRepository} from './billing-sync';
export function commerceConfig(){const mode=process.env.STRIPE_MODE??'test';const secret=process.env.STRIPE_SECRET_KEY??'';const origin=process.env.NEXT_PUBLIC_SITE_URL??'';let monthly=500,yearly=5000,valid=true;try{monthly=configuredAmount(process.env.SUPPORTER_MONTHLY_CENTS,500);yearly=configuredAmount(process.env.SUPPORTER_YEARLY_CENTS,5000);}catch{valid=false;}
 const backend=!simulation&&process.env.NEXT_PUBLIC_DEMO_MODE!=='true'&&!!process.env.NEXT_PUBLIC_SUPABASE_URL&&!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY&&!!process.env.SUPABASE_SERVICE_ROLE_KEY;
 const originValid=/^https:\/\//.test(origin)||(process.env.NODE_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
 const ready=!!(backend&&valid&&originValid&&['test','live'].includes(mode)&&secret.startsWith(mode==='live'?'sk_live_':'sk_test_')&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID&&process.env.STRIPE_SUPPORTER_YEARLY_PRICE_ID);
 return {ready,backend,livemode:mode==='live',monthly,yearly,origin,monthlyPrice:process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID??'',yearlyPrice:process.env.STRIPE_SUPPORTER_YEARLY_PRICE_ID??'',reason:simulation?'Payments require real accounts. They are unavailable in browser simulation.':'Payments are not configured yet.'};}
export function stripeClient(){return new Stripe(process.env.STRIPE_SECRET_KEY!,{maxNetworkRetries:2,timeout:15000});}
export function supportedPrices(){return new Set([process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID!,process.env.STRIPE_SUPPORTER_YEARLY_PRICE_ID!,...(process.env.STRIPE_LEGACY_PRICE_IDS??'').split(',')].filter(Boolean));}
export async function commerceIdentity(){if(!commerceConfig().backend)throw new Error('Real account services are not configured.');return identity();}
export async function administrator(){const {user}=await commerceIdentity();const {data,error}=await admin().from('profiles').select('role').eq('id',user.id).single();if(error||data?.role!=='admin')throw new Error('Administrator access required.');return user;}
export function repository():BillingRepository{const db=admin();return {
 knownCustomer:async id=>{const r=await db.from('billing_customers').select('livemode').eq('customer_id',id).maybeSingle();if(r.error)throw r.error;return r.data;},
 processed:async id=>{const r=await db.from('billing_events').select('id').eq('id',id).maybeSingle();if(r.error)throw r.error;return !!r.data;},
 claim:async id=>{const r=await db.rpc('commerce_claim',{lock_key:'customer:'+id});if(r.error)throw r.error;return r.data;},
 release:async(id,lease)=>{const r=await db.rpc('commerce_release',{lock_key:'customer:'+id,lease});if(r.error)throw r.error;},
 apply:async(event,cust,lease,subscriptions,payments)=>{const r=await db.rpc('apply_billing_snapshot',{event_id:event.id,event_type:event.type,event_created:event.created,cust,lease,subscriptions,payments});if(r.error)throw r.error;},
 };}
export async function entitled(userId:string){if(!commerceConfig().ready)return false;const r=await admin().rpc('supporter_active',{actor:userId,mode:commerceConfig().livemode});if(r.error)throw r.error;return r.data===true;}
export async function publicSupporters(){const config=commerceConfig();if(!config.ready)return {};const db=admin();const r=await db.from('billing_subscriptions').select('user_id,period_end,livemode').eq('livemode',config.livemode).eq('status','active').eq('invoice_paid',true).eq('refunded',false).eq('disputed',false).gt('period_end',new Date().toISOString());if(r.error)throw r.error;const ids=[...new Set((r.data??[]).map(x=>x.user_id))];if(!ids.length)return {};const preferences=await db.from('supporter_preferences').select('user_id,accent').in('user_id',ids);if(preferences.error)throw preferences.error;return Object.fromEntries(ids.map(id=>[id,{supporter:true,test:!config.livemode,accent:preferences.data?.find(p=>p.user_id===id)?.accent??'red',access_end:(r.data??[]).filter(x=>x.user_id===id).map(x=>x.period_end).sort().at(-1)}]));}
