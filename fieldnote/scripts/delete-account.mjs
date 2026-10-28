// Operator-only cleanup. Requires server credentials in the environment, never command arguments.
import {createClient} from '@supabase/supabase-js';
const id=process.argv[2];
if(!/^[0-9a-f-]{36}$/i.test(id??''))throw new Error('Usage: node --env-file=.env.local scripts/delete-account.mjs USER_UUID');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
function check(result){if(result.error)throw result.error;return result.data;}
const request=check(await db.from('deletion_requests').select('*').eq('user_id',id).single());
if(!request)throw new Error('A deletion request is required.');
const latest=check(await db.from('upload_intents').select('expires_at').eq('user_id',id).order('expires_at',{ascending:false}).limit(1));
if(latest[0]&&Date.parse(latest[0].expires_at)+5*60000>Date.now())throw new Error('Wait until every outstanding upload token has expired plus five minutes, then retry.');
check(await db.from('deletion_requests').update({state:'processing',error:null}).eq('id',request.id));
try{
 // List full owner prefixes, including orphaned or partially processed objects. Retry safely after failures.
 for(const bucket of ['evidence-originals','evidence-previews']){
  for(;;){const objects=check(await db.storage.from(bucket).list(id,{limit:100}));if(!objects.length)break;check(await db.storage.from(bucket).remove(objects.map(o=>`${id}/${o.name}`)));}
 }
 const reports=check(await db.from('reports').select('event_id').eq('author_id',id));
 // Restricted correction records may contain the account's earlier text; remove their personal payload.
 check(await db.from('audit').update({details:{},reason:'Account deletion: personal audit content removed.'}).eq('actor_id',id));
 check(await db.from('concerns').delete().eq('user_id',id));
 check(await db.from('reports').delete().eq('author_id',id));
 // Delete event shells that no longer have accounts; remove witness-authored titles/locations when
 // other accounts remain only through an operator review, recorded below as a required task.
 for(const eid of new Set(reports.map(r=>r.event_id))){const remaining=check(await db.from('reports').select('id').eq('event_id',eid).limit(1));if(!remaining.length)check(await db.from('events').delete().eq('id',eid));}
 check(await db.auth.admin.deleteUser(id));
 check(await db.from('deletion_requests').update({state:'active_cleanup_complete_review_and_backups_pending',error:null}).eq('id',request.id));
 console.log('Active account, reports, and owner media removed. Review shared event text, third-party audit references, and backups before marking the deletion complete. Request ID:',request.id);
}catch(e){await db.from('deletion_requests').update({state:'cleanup_failed',error:'Operator cleanup failed; inspect private server logs and retry.'}).eq('id',request.id);console.error('Cleanup did not finish. Retry after resolving the storage/database error.');process.exitCode=1;}
