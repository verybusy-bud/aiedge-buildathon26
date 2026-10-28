import type { FieldEvent } from './types';

export const eventCategories = ['Food & drink','Roads & transit','Special events','Local news','Environment','Public services','Community','Other'] as const;
export const themes = ['All news','Food','Traffic','Special events','Local news','Environment','Public services','Community'] as const;
export type Theme = typeof themes[number];
const vocabulary: Record<string, string[]> = {
  food: ['food','restaurant','restaurants','dining','cafe','cafes','coffee','bakery','meal','meals','kitchen','lunch','dinner','breakfast','taco','tacos','pizza','eat','eats','foodtruck'],
  traffic: ['traffic','road','roads','transit','bus','buses','lane','lanes','closure','closed','accident','crash','congestion','parking','detour','construction'],
  specialevents: ['festival','festivals','concert','concerts','parade','fair','celebration','show','gathering','music','specialevents'],
};
export function normalize(text:string) { return text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function tokens(text:string) { return normalize(text.replace(/special\s+events?/gi,'specialevents')).split(/\s+/).filter(Boolean); }
export function eventThemes(event:FieldEvent):string[] {
  const words = new Set(tokens(`${event.title} ${event.category} ${event.editorial_summary??''} ${event.source_name??''} ${event.reports.map(r=>r.body).join(' ')}`));
  const result = Object.entries(vocabulary).filter(([,terms])=>terms.some(t=>words.has(t))).map(([key])=>key);
  if(event.category==='Food & drink'&&!result.includes('food'))result.push('food');
  if(event.category==='Roads & transit'&&!result.includes('traffic'))result.push('traffic');
  if(event.category==='Special events'&&!result.includes('specialevents'))result.push('specialevents');
  return result;
}
export function matchesSearch(event:FieldEvent,query:string,theme:string='All news'):boolean {
  const inferred = eventThemes(event);
  const themeKey = theme==='Special events'?'specialevents':theme.toLowerCase();
  if(theme!=='All news'&&!inferred.includes(themeKey)&&event.category!==theme)return false;
  const haystack=tokens(`${event.title} ${event.location} ${event.category} ${event.editorial_summary??''} ${event.source_name??''} ${event.reports.map(r=>r.body).join(' ')}`);
  return tokens(query).every(term=> inferred.includes(term)||haystack.some(word=>word.startsWith(term)));
}
const stopWords=new Set(['a','an','the','at','in','on','of','to','and','near','is','was','seen','reported','report','sioux','falls']);
function significant(text:string){return new Set(tokens(text).filter(t=>!stopWords.has(t)));}
function overlap(a:Set<string>,b:Set<string>){const intersection=[...a].filter(t=>b.has(t)).length;return intersection/Math.max(1,new Set([...a,...b]).size);}
export function relatedEvents(events:FieldEvent[],title:string,location:string,observedAt:string):FieldEvent[]{
  const titleWords=significant(title),place=normalize(location),when=Date.parse(observedAt);
  if(titleWords.size<2||!Number.isFinite(when))return [];
  return events.map(event=>{
    const timestamps=event.reports.map(r=>Date.parse(r.observed_at));
    if(!timestamps.length)timestamps.push(Date.parse(event.source_published_at??event.created_at));
    const closest=Math.min(...timestamps.map(time=>Math.abs(time-when)));
    if(closest>24*3600000&&!event.summary_ai_generated)return {event,score:0};
    const similarity=overlap(titleWords,significant(event.title));
    const samePlace=place.length>=3&&normalize(event.location)===place;
    const relatedPlace=place.length>=3&&overlap(significant(place),significant(event.location))>=.35;
    const score=similarity>=.35&&(samePlace||relatedPlace||!place)?similarity+(samePlace?.25:relatedPlace?.1:0):0;
    return {event,score};
  }).filter(x=>x.score>=.35).sort((a,b)=>b.score-a.score||a.event.id.localeCompare(b.event.id)).slice(0,3).map(x=>x.event);
}
