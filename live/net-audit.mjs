/**
 * Strictly sanitized network observations for Web Slim.
 * Never include request IDs, URL values, header values, bodies, cookies,
 * account identifiers, conversation IDs or tab IDs in exported observations.
 */
const ALLOWED_QUERY_KEYS=new Set([
 "limit","offset","order","expand","exclude_conversation_origin","hide_snorlax",
 "is_archived","is_starred","num_turns","include_has_versions","before",
 "includeextensions","cursor","page_size","include_generated_titles","conversation_origin"
]);
const HEADER_NAME_RE=/^[a-z][a-z0-9-]{0,63}$/;
// Names seen in the supplied first-party HAR plus stable browser headers.
// Unknown names are intentionally omitted (not assumed non-sensitive).
const HEADER_ALLOWLIST=new Set([
 "accept","accept-encoding","accept-language","authorization","cache-control",
 "chatgpt-account-id","content-type","cookie","origin","originator","pragma",
 "priority","referer","sec-ch-ua","sec-ch-ua-arch","sec-ch-ua-bitness",
 "sec-ch-ua-full-version","sec-ch-ua-full-version-list","sec-ch-ua-mobile",
 "sec-ch-ua-model","sec-ch-ua-platform","sec-ch-ua-platform-version",
 "sec-fetch-dest","sec-fetch-mode","sec-fetch-site","user-agent",
 "oai-device-id","oai-did","oai-language",
 "x-openai-codex-window-type","x-openai-rate-limit-join-workspace",
 "x-openai-rejoin-pro-cta","x-openai-web-frontend"
]);
const METHODS=new Set(["GET","POST","PUT"]);
const SOURCE_NAMES=new Set(["official","extension"]);

export function describeEndpoint(rawUrl){
 let url;
 try{url=new URL(rawUrl);}catch{return null;}
 if(url.origin!=="https://chatgpt.com")return null;
 const path=url.pathname;
 let route=null;
 if(path==="/backend-api/conversations")route="conversations.list";
 else if(/^\/backend-api\/conversations\/[^/]+$/.test(path))route="conversations.detail";
 else if(path==="/backend-api/me")route="session.me";
 else if(path==="/backend-api/models")route="models.list";
 else if(path==="/backend-api/wham/accounts/check")route="accounts.check";
 else if(path==="/backend-api/ps/plugins/installed")route="plugins.installed";
 else if(path==="/backend-api/ps/apps/batch")route="plugins.metadata";
 else if(path==="/backend-api/f/conversation")route="conversation.send";
 else if(path==="/backend-api/f/conversation/prepare")route="conversation.prepare";
 else if(path==="/backend-api/files")route="files.register";
 else if(path==="/backend-api/files/process_upload_stream")route="files.process";
 else if(path==="/backend-api/sentinel/chat-requirements/prepare")route="sentinel.prepare";
 else if(path==="/backend-api/sentinel/chat-requirements/finalize")route="sentinel.finalize";
 if(!route)return null;
 const queryNames=[...new Set([...url.searchParams.keys()]
  .map(key=>key.toLowerCase()).filter(key=>ALLOWED_QUERY_KEYS.has(key)))].sort();
 return {route,queryNames};
}

export function headerNames(headers){
 if(!Array.isArray(headers))return [];
 return [...new Set(headers.map(h=>String(h?.name??"").trim().toLowerCase())
  .filter(name=>HEADER_NAME_RE.test(name)&&HEADER_ALLOWLIST.has(name)))].sort();
}

export function classifySource({initiator,tabId},extensionOrigin,selectedTabId){
 if(initiator==="https://chatgpt.com"&&tabId===selectedTabId&&Number.isInteger(tabId)&&tabId>=0)
  return "official";
 if(initiator===extensionOrigin)return "extension";
 return null;
}

export function startObservation(details,extensionOrigin,selectedTabId,ordinal){
 const source=classifySource(details,extensionOrigin,selectedTabId);
 const endpoint=describeEndpoint(details?.url);
 if(!source||!endpoint||!METHODS.has(details.method))return null;
 return {
  source,route:endpoint.route,method:details.method,
  queryNames:endpoint.queryNames,headerNames:headerNames(details.requestHeaders),
  ordinal:Number.isSafeInteger(ordinal)?ordinal:0
 };
}
export function mimeGroup(responseHeaders){
 if(!Array.isArray(responseHeaders))return "unknown";
 const type=responseHeaders.find(h=>String(h?.name).toLowerCase()==="content-type");
 const text=String(type?.value??"").toLowerCase();
 if(text.includes("json"))return "json";
 if(text.includes("event-stream"))return "sse";
 if(text.includes("html"))return "html";
 if(text.startsWith("text/"))return "text";
 return text?"other":"unknown";
}
export function completeObservation(start,details){
 if(!start||!SOURCE_NAMES.has(start.source))return null;
 const status=Number(details?.statusCode);
 return {
  ...start,
  status:Number.isInteger(status)&&status>=100&&status<=599?status:null,
  responseType:mimeGroup(details?.responseHeaders),
  durationMs:Math.min(300000,Math.max(0,Math.round(
   (Number(details?.timeStamp)||0)-(Number(details?._startedAt)||0)
  )))
 };
}
export function compareObservations(records){
 // Compare captured on-wire *visible* header names and query-key sets.
 // A record may be absent because this Chrome API does not expose every request.
 const groups=new Map();
 for(const record of records){
  const key=record.method+" "+record.route;
  if(!groups.has(key))groups.set(key,{route:record.route,method:record.method,official:[],extension:[]});
  groups.get(key)[record.source]?.push(record);
 }
 return [...groups.values()].map(group=>{
  const lastA=group.official.at(-1),lastB=group.extension.at(-1);
  const headerA=new Set(lastA?.headerNames??[]),headerB=new Set(lastB?.headerNames??[]);
  const queryA=new Set(lastA?.queryNames??[]),queryB=new Set(lastB?.queryNames??[]);
  return {
   route:group.route,method:group.method,
   officialCount:group.official.length,extensionCount:group.extension.length,
   onlyOfficialHeaders:[...headerA].filter(x=>!headerB.has(x)).sort(),
   onlyExtensionHeaders:[...headerB].filter(x=>!headerA.has(x)).sort(),
   onlyOfficialQueryNames:[...queryA].filter(x=>!queryB.has(x)).sort(),
   onlyExtensionQueryNames:[...queryB].filter(x=>!queryA.has(x)).sort(),
   officialLastStatus:lastA?.status??null,extensionLastStatus:lastB?.status??null
  };
 });
}
