import Stripe from 'stripe';
export const billingEventTypes=new Set(['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','invoice.payment_action_required','invoice.voided','invoice.marked_uncollectible','invoice.updated','charge.refunded','refund.created','refund.updated','refund.failed','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled','customer.deleted']);
export function verifyBillingEvent(stripe:Stripe,body:string,signature:string,secret:string){return stripe.webhooks.constructEvent(body,signature,secret,300);}
const objectId=(value:any):string|null=>typeof value==='string'?value:value?.id??null;
export interface BillingRepository {knownCustomer(id:string):Promise<{livemode:boolean}|null>;processed(id:string):Promise<boolean>;claim(customer:string):Promise<string|null>;release(customer:string,lease:string):Promise<void>;apply(event:Stripe.Event,customer:string,lease:string,subscriptions:unknown[],payments:unknown[]):Promise<void>;}
async function chargeFor(stripe:Stripe,paymentIntent:string){const intent=await stripe.paymentIntents.retrieve(paymentIntent);return intent.latest_charge?await stripe.charges.retrieve(objectId(intent.latest_charge)!):null;}
export async function currentBillingSnapshot(stripe:Stripe,customer:string,priceIds:Set<string>,livemode:boolean){
 const subscriptions:any[]=[],payments:any[]=[];
 const currentCustomer=await stripe.customers.retrieve(customer);
 if(currentCustomer.deleted)return {subscriptions,payments};
 if(currentCustomer.livemode!==livemode)throw new Error('Stripe customer mode mismatch');
 for await(const sub of stripe.subscriptions.list({customer,status:'all',limit:100})){
  if(sub.livemode!==livemode)throw new Error('Stripe mode mismatch');
  const item=sub.items.data.find(i=>priceIds.has(i.price.id)&&i.price.currency==='usd');if(!item)continue;
  const invoiceId=objectId(sub.latest_invoice);let paid=false,refunded=false,disputed=false;
  if(invoiceId){const invoice=await stripe.invoices.retrieve(invoiceId);let captured=0,returned=0;
   for await(const payment of stripe.invoicePayments.list({invoice:invoiceId,status:'paid',limit:100})){
    const charge=payment.payment.payment_intent?await chargeFor(stripe,objectId(payment.payment.payment_intent)!):payment.payment.charge?await stripe.charges.retrieve(objectId(payment.payment.charge)!):null;
    if(charge){if(objectId(charge.customer)!==customer||charge.livemode!==livemode)throw new Error('Charge ownership mismatch');if(charge.paid&&charge.status==='succeeded'){captured+=payment.amount_paid??0;returned+=charge.amount_refunded;if(charge.disputed){const disputes=await stripe.disputes.list({charge:charge.id,limit:100});disputed=disputed||!disputes.data.length||disputes.data.some(d=>!['won','warning_closed','prevented'].includes(d.status));}}}
   }
   paid=invoice.status==='paid'&&invoice.amount_paid>0&&captured>=invoice.amount_paid;refunded=paid&&returned>=invoice.amount_paid;
  }
  subscriptions.push({id:sub.id,status:sub.status,price_id:item.price.id,period_end:new Date(item.current_period_end*1000).toISOString(),cancel_at_period_end:sub.cancel_at_period_end,invoice_paid:paid,refunded,disputed});
 }
 // Read current Checkout/payment state, not potentially stale webhook payloads.
 for await(const checkout of stripe.checkout.sessions.list({customer,limit:100})){
  if(checkout.metadata?.fieldnote_kind!=='contribution'&&checkout.metadata?.fieldnote_kind!=='membership')continue;
  if(checkout.livemode!==livemode)throw new Error('Stripe mode mismatch');
  const intentId=objectId(checkout.payment_intent);const charge=intentId?await chargeFor(stripe,intentId):null;
  if(charge&&objectId(charge.customer)!==customer)throw new Error('Payment ownership mismatch');
  let status=checkout.payment_status==='paid'?'paid':checkout.status==='expired'?'expired':'pending';if(charge?.refunded)status='refunded';else if(charge?.amount_refunded)status='partially_refunded';else if(charge?.disputed)status='disputed';else if(charge?.status==='failed')status='failed';
  payments.push({id:checkout.id,kind:checkout.metadata!.fieldnote_kind,amount:checkout.amount_total??0,currency:checkout.currency??'usd',status,amount_refunded:charge?.amount_refunded??0,payment_intent_id:intentId});
 }
 return {subscriptions,payments};
}
export async function reconcileBilling(event:Stripe.Event,stripe:Stripe,repo:BillingRepository,prices:Set<string>,livemode:boolean){
 if(event.livemode!==livemode)throw new Error('Webhook mode mismatch');
 if(!billingEventTypes.has(event.type))return 'ignored';if(await repo.processed(event.id))return 'duplicate';
 const object=event.data.object as any;let customer=objectId(object.customer);
 if(event.type==='customer.deleted')customer=object.id;
 if(!customer&&object.charge){const charge=await stripe.charges.retrieve(objectId(object.charge)!);customer=objectId(charge.customer);}
 if(!customer)return 'ignored';const known=await repo.knownCustomer(customer);if(!known)return 'ignored';if(known.livemode!==livemode)throw new Error('Customer mode mismatch');
 const lease=await repo.claim(customer);if(!lease)throw new Error('Billing reconciliation busy; retry');
 try{if(await repo.processed(event.id))return 'duplicate';const snapshot=event.type==='customer.deleted'?{subscriptions:[],payments:[]}:await currentBillingSnapshot(stripe,customer,prices,livemode);await repo.apply(event,customer,lease,snapshot.subscriptions,snapshot.payments);return 'processed';}finally{await repo.release(customer,lease);}
}
