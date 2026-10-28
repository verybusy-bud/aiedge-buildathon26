import CommerceLayout from '@/components/commerce-layout';import {BillingSettings} from '@/components/payments';
export const metadata={title:'Account & billing — Fieldnote'};
export default function Page(){return <CommerceLayout><span className="eyebrow">YOUR ACCOUNT</span><h1>Supporter & billing</h1><p className="commerce-lead">Membership status, billing, and your Supporter benefits.</p><BillingSettings/></CommerceLayout>;}
