import type { Factors } from './types';
export function assess(accounts:number,captures:number,latest:string|null,corroborated:boolean,conflicting:boolean,now=Date.now()):{score:number|null;factors:Factors}{
 const age=latest?Math.max(0,now-Date.parse(latest))/3600000:Infinity;
 const factors={accounts:accounts>=3?2:accounts===2?1:0,provenance:Math.min(captures*.5,1),recency:latest?(age<=6?1:age<=24?.5:0):0,moderator:corroborated?1:0,conflict:conflicting?-1:0};
 return {score:accounts?Math.max(0,Math.min(5,Object.values(factors).reduce((a,b)=>a+b,0))):null,factors};
}
