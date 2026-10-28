import CommerceLayout from '@/components/commerce-layout';import {ContributionForm} from '@/components/payments';
export const metadata={title:'Support Fieldnote'};
export default function Page(){return <CommerceLayout><span className="eyebrow">A ONE-TIME THANK-YOU</span><h1>Support Fieldnote</h1><p className="commerce-lead">Make a one-time contribution toward clear, useful local information.</p><p>This is not a recurring membership and does not unlock paid benefits. No verification, favorable moderation, or special ranking is included.</p><ContributionForm/></CommerceLayout>;}
