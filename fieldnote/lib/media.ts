export function sniff(b:Uint8Array):string|null{
 if(b.length<12)return null;
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
 const ascii=(a:number,z:number)=>String.fromCharCode(...b.slice(a,z));
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(b[0]===26&&b[1]===69&&b[2]===223&&b[3]===163&&ascii(0,Math.min(b.length,4096)).includes('webm'))return 'video/webm';
 if(ascii(4,8)==='ftyp'&&['isom','iso2','mp41','mp42','avc1','M4V '].includes(ascii(8,12)))return 'video/mp4';
 return null;
}
