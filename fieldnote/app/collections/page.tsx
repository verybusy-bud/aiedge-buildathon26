import CommerceLayout from '@/components/commerce-layout';import {BookmarkCollections} from '@/components/payments';
export const metadata={title:'Bookmark collections — Fieldnote'};
export default function Page(){return <CommerceLayout><span className="eyebrow">SUPPORTER BENEFIT</span><h1>Bookmark collections</h1><p className="commerce-lead">Keep useful stories together.</p><BookmarkCollections/></CommerceLayout>;}
