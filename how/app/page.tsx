import { FieldnoteApp } from '@/app/components/FieldnoteApp';
import { getFieldnoteData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await getFieldnoteData();
  return <FieldnoteApp events={data.events} account={data.user} displayName={data.displayName} moderator={data.moderator} configured={data.configured} demo={data.demo} error={data.error} />;
}
