export type Factors = {accounts:number;provenance:number;recency:number;moderator:number;conflict:number};
export type Evidence = {id:string;mime:string;sha256:string;received_at:string;preview_path:string|null};
export type Report = {id:string;event_id:string;author_id:string;display_name:string;body:string;observed_at:string;created_at:string;assisted:boolean;state:string;evidence:Evidence[]};
export type FieldEvent = {id:string;title:string;category:string;location:string;status:string;created_at:string;latest_report_at:string|null;score:number|null;factors:Factors;reports:Report[]};
