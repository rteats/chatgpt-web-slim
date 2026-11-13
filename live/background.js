import {readFirstPartyAccountHeader} from "./account-capture.mjs";
import {startObservation,completeObservation,compareObservations} from "./net-audit.mjs";

// Privacy-minimal capture of *metadata only*. No request interception or mutation.
const EXTENSION_ORIGIN=chrome.runtime.getURL("").replace(/\/$/,"");
const AUDIT_KEY="webSlimNetworkAudit";
const MAX_ENTRIES=80;
const MAX_DURATION_MS=180000;
const EMPTY_EVIDENCE=()=>({started:0,succeeded:0,failed:0,lastStatus:null});
const pending=new Map();
let audit={enabled:false,tabId:null,startedAt:0,endedReason:null,entries:[],clientEvidence:EMPTY_EVIDENCE()};
let writes=Promise.resolve();
const ready=chrome.storage.session.get(AUDIT_KEY).then(data=>{
 const stored=data[AUDIT_KEY];
 if(stored&&typeof stored==="object"&&Array.isArray(stored.entries)){
  audit={
   enabled:stored.enabled===true,tabId:Number.isInteger(stored.tabId)?stored.tabId:null,
   startedAt:Number(stored.startedAt)||0,
   endedReason:typeof stored.endedReason==="string"?stored.endedReason:null,
   entries:stored.entries.slice(-MAX_ENTRIES),
   clientEvidence:{...EMPTY_EVIDENCE(),...(stored.clientEvidence??{})}
  };
 }
}).catch(()=>{});

function save(){
 // Sequential writes prevent an older async write overwriting a newer result.
 const snapshot={...audit,entries:audit.entries.slice()};
 writes=writes.catch(()=>{}).then(()=>chrome.storage.session.set({[AUDIT_KEY]:snapshot}));
 return writes;
}
function publicReport(){
 return {
  schema:"web-slim-network-v1",
  version:"0.2.7",
  enabled:audit.enabled,
  endedReason:audit.endedReason,
  limit:MAX_ENTRIES,
  windowSeconds:MAX_DURATION_MS/1000,
  count:audit.entries.length,
  clientEvidence:{...audit.clientEvidence},
  coverage:{
   officialListObserved:audit.entries.some(x=>x.source==="official"&&x.route==="conversations.list"),
   extensionListObserved:audit.entries.some(x=>x.source==="extension"&&x.route==="conversations.list"),
   extensionClientStarted:audit.clientEvidence.started>0
  },
  records:audit.entries.slice(),
  comparisons:compareObservations(audit.entries),
  privacy:"No URLs, URL values, header values, request or response bodies, account IDs, cookies, tokens or browser tab IDs"
 };
}
function maybeStopExpired(){
 if(!audit.enabled)return false;
 const expired=Date.now()-audit.startedAt>=MAX_DURATION_MS;
 if(expired||audit.entries.length>=MAX_ENTRIES){
  audit.enabled=false;
  audit.endedReason=expired?"time_limit":"entry_limit";
  pending.clear();
  void save();
  return true;
 }
 return false;
}

// Existing first-party workspace selector capture. This is separate from the
// opt-in network metadata monitor and persists only in session storage.
chrome.webRequest.onBeforeSendHeaders.addListener(details=>{
 const accountId=readFirstPartyAccountHeader(details);
 if(accountId){
  chrome.storage.session.set({capturedAccountId:accountId}).catch(()=>{});
 }
},{
 urls:[
  "https://chatgpt.com/backend-api/conversations*",
  "https://chatgpt.com/backend-api/wham/accounts/check"
 ]
},["requestHeaders"]);

// The informational onSendHeaders event runs *after* extension header changes,
// but Chrome still may omit some network-generated headers from its API.
// Header values are discarded immediately by startObservation.
const filter={urls:["https://chatgpt.com/backend-api/*"]};
chrome.webRequest.onSendHeaders.addListener(details=>{
 void ready.then(()=>{
  if(!audit.enabled||maybeStopExpired())return;
  const start=startObservation(details,EXTENSION_ORIGIN,audit.tabId,audit.entries.length+1);
  if(!start)return;
  if(pending.size>=100)pending.clear();
  pending.set(details.requestId,{start,timeStamp:details.timeStamp});
 });
},filter,["requestHeaders"]);
chrome.webRequest.onCompleted.addListener(details=>{
 void ready.then(()=>{
  const info=pending.get(details.requestId);
  if(!info)return;
  pending.delete(details.requestId);
  if(!audit.enabled||maybeStopExpired())return;
  const record=completeObservation(info.start,{
   statusCode:details.statusCode,responseHeaders:details.responseHeaders,
   timeStamp:details.timeStamp,_startedAt:info.timeStamp
  });
  if(!record)return;
  audit.entries.push(record);
  if(audit.entries.length>=MAX_ENTRIES){
   audit.enabled=false;
   audit.endedReason="entry_limit";
   pending.clear();
  }
  void save();
 });
},filter,["responseHeaders"]);
chrome.webRequest.onErrorOccurred.addListener(details=>{
 void ready.then(()=>{
  const info=pending.get(details.requestId);
  if(!info)return;
  pending.delete(details.requestId);
  if(!audit.enabled||maybeStopExpired())return;
  audit.entries.push({
   ...info.start,status:null,responseType:"unknown",
   durationMs:Math.min(MAX_DURATION_MS,Math.max(0,Math.round(
    details.timeStamp-info.timeStamp))),
   result:"network_error"
  });
  if(audit.entries.length>=MAX_ENTRIES){
   audit.enabled=false;audit.endedReason="entry_limit";pending.clear();
  }
  void save();
 });
},filter);

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return false;
 const execute=async()=>{
  await ready;
  switch(message?.type){
   case "WEB_SLIM_AUDIT_CLIENT_NOTE": {
    // Trusted extension-owned page only; no URLs/headers/IDs/data bodies accepted.
    let trusted=false;
    try{
     const source=new URL(sender.url);
     trusted=source.origin===EXTENSION_ORIGIN&&source.pathname==="/index.html";
    }catch{}
    if(!trusted)return {ok:false,error:"untrusted_sender"};
    if(!audit.enabled||maybeStopExpired())return {ok:true};
    if(message.operation!=="conversations")return {ok:false,error:"unsupported_operation"};
    const phase=message.phase;
    if(phase==="request_started")audit.clientEvidence.started++;
    else if(phase==="request_succeeded"){
     audit.clientEvidence.succeeded++;
     audit.clientEvidence.lastStatus=Number(message.status)===200?200:null;
    }else if(phase==="request_failed"){
     audit.clientEvidence.failed++;
     const code=Number(message.status);
     audit.clientEvidence.lastStatus=Number.isInteger(code)&&code>=100&&code<=599?code:null;
    }else return {ok:false,error:"unsupported_phase"};
    await save();
    return {ok:true};
   }
   case "WEB_SLIM_GET_ACCOUNT": {
    const value=await chrome.storage.session.get("capturedAccountId");
    return {accountId:value.capturedAccountId??null};
   }
   case "WEB_SLIM_CLEAR_ACCOUNT": {
    await chrome.storage.session.remove("capturedAccountId");
    return {ok:true};
   }
   case "WEB_SLIM_AUDIT_START": {
    if(audit.enabled)return {ok:false,error:"already_running",report:publicReport()};
    const tabId=message.tabId;
    if(!Number.isInteger(tabId)||tabId<0)return {ok:false,error:"bad_tab"};
    const tab=await chrome.tabs.get(tabId).catch(()=>null);
    let valid=false;
    try{valid=new URL(tab?.url).origin==="https://chatgpt.com";}catch{}
    if(!valid)return {ok:false,error:"not_chatgpt_tab"};
    audit={enabled:true,tabId,startedAt:Date.now(),endedReason:null,entries:[],clientEvidence:EMPTY_EVIDENCE()};
    pending.clear();
    await save();
    return {ok:true,report:publicReport()};
   }
   case "WEB_SLIM_AUDIT_STOP": {
    audit.enabled=false;pending.clear();audit.endedReason=audit.endedReason??"user_stopped";
    await save();
    return {ok:true,report:publicReport()};
   }
   case "WEB_SLIM_AUDIT_CLEAR": {
    audit.enabled=false;pending.clear();audit={enabled:false,tabId:null,startedAt:0,
      endedReason:"cleared",entries:[],clientEvidence:EMPTY_EVIDENCE()};
    await save();
    return {ok:true,report:publicReport()};
   }
   case "WEB_SLIM_AUDIT_GET": {
    maybeStopExpired();
    return {ok:true,report:publicReport()};
   }
   default:return null;
  }
 };
 execute().then(sendResponse).catch(()=>sendResponse({ok:false,error:"internal"}));
 return true;
});
