/**
 * Privacy-minimal diagnostics. Events are strictly allowlisted; never record
 * URLs, IDs, request/response bodies, headers, cookies, titles or stacks.
 * Kept in memory only; exported on explicit user interaction.
 */
const EVENT_NAMES=new Set([
  "session_started","account_resolved","probe_result","probe_failed","action_started","action_succeeded","action_failed",
  "request_started","request_succeeded","request_failed","response_empty","cache_hit",
  "request_joined","runtime_error","unhandled_rejection"
]);
const OPERATIONS=new Set(["conversations","conversation","plugins","older","session","accounts","site","extension","unknown"]);
const ERROR_CLASSES=new Set(["network","authentication","rate_limited","server","format","validation","unknown"]);
function finiteInt(value,max=86400000){
  return typeof value==="number"&&Number.isFinite(value)?
    Math.min(max,Math.max(0,Math.round(value))):undefined;
}
export class Diagnostics {
  constructor({now=()=>Date.now(),limit=200}={}){
    this.now=now;this.limit=Math.min(500,Math.max(1,Math.trunc(limit)));
    this.events=[];
    this.add("session_started",{operation:"unknown"});
  }
  add(event,details={}){
    if(!EVENT_NAMES.has(event))return;
    const record={time:new Date(this.now()).toISOString(),event};
    if(OPERATIONS.has(details.operation))record.operation=details.operation;
    const status=finiteInt(details.status,999);
    if(status!==undefined&&status>=100)record.status=status;
    for(const field of ["durationMs","count","total"]){
      const n=finiteInt(details[field]);
      if(n!==undefined)record[field]=n;
    }
    if(ERROR_CLASSES.has(details.errorClass))record.errorClass=details.errorClass;
    if(["json","html","text","other"].includes(details.responseType))record.responseType=details.responseType;
    this.events.push(record);
    if(this.events.length>this.limit)this.events.splice(0,this.events.length-this.limit);
  }
  snapshot(){
    return {
      schema:"web-slim-diag-v1",
      browser:navigator.userAgentData?.brands?.map(x=>x.brand).filter(x=>/Chrom|Edge|Brave/i.test(x)).slice(0,3)??[],
      appVersion:"0.2.6",
      exportedAt:new Date(this.now()).toISOString(),
      privacy:"No URLs, message content, identifiers, headers, tokens, cookies or stacks",
      events:this.events.slice()
    };
  }
  download(){
    const data=JSON.stringify(this.snapshot(),null,2);
    const blob=new Blob([data],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    try{
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download="web-slim-diagnostics.json";
      document.body.append(anchor);anchor.click();anchor.remove();
    }finally{
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  }
}
export function errorClass(error){
  const kind=error?.kind;
  if(ERROR_CLASSES.has(kind))return kind;
  const code=Number(error?.status)||0;
  if(code===401||code===403)return "authentication";
  if(code===429||code===503)return "rate_limited";
  if(code>=500)return "server";
  if(code===400||code===404||code===422)return "validation";
  // Err on the side of omitting potentially sensitive messages.
  return "unknown";
}
