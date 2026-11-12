import test from "node:test";
import assert from "node:assert/strict";
import {ChatReader} from "./api.mjs";
import {listItems,visibleMessages,pageState} from "./model.mjs";

// All account identifiers below are synthetic. No IDs from user HARs.
const WORKSPACE_ID="11111111-2222-4333-8444-555555555555";
const accountResponse={accounts:[{id:WORKSPACE_ID,can_access_with_session:true}],
 default_account_id:WORKSPACE_ID};
const response=(data,status=200,headers={"content-type":"application/json"})=>({
 status,ok:status>=200&&status<300,
 headers:{get:key=>headers[key.toLowerCase()]??null},
 json:async()=>data
});
const createFake=({handle=()=>response({items:[],total:0}),onDiagnostic=()=>{}}={})=>{
 const calls=[];
 const reader=new ChatReader({
  sleep:async()=>{},
  onDiagnostic,
  fetchImpl:async(url,opts)=>{
   const call={url:new URL(url),opts};calls.push(call);
   if(call.url.pathname==="/backend-api/wham/accounts/check")return response(accountResponse);
   return handle(call);
  }
 });
 return {reader,calls};
};

test("uses authenticated default workspace ID from account check before list",async()=>{
 const {reader,calls}=createFake();
 await reader.list();
 assert.equal(calls.length,2);
 assert.equal(calls[0].url.pathname,"/backend-api/wham/accounts/check");
 assert.equal(calls[0].opts.headers["ChatGPT-Account-ID"],undefined);
 assert.equal(calls[1].url.pathname,"/backend-api/conversations");
 assert.equal(calls[1].opts.headers["ChatGPT-Account-ID"],WORKSPACE_ID);
 assert.equal(calls[1].opts.credentials,"include");
 assert.equal(calls[1].opts.method,"GET");
 assert.equal(calls[1].url.origin,"https://chatgpt.com");
});
test("deduplication and cache prevent duplicate network calls",async()=>{
 const {reader,calls}=createFake();
 await Promise.all([reader.list(),reader.list()]);
 await reader.list();
 assert.equal(calls.length,2); // one account check and one conversation listing
});
test("refresh clears account context as well as response cache",async()=>{
 const {reader,calls}=createFake();
 await reader.list();reader.clearCache();await reader.list();
 assert.equal(calls.filter(x=>x.url.pathname==="/backend-api/wham/accounts/check").length,2);
});
test("invalid IDs never trigger HTTP requests",async()=>{
 const {reader,calls}=createFake();
 await assert.rejects(reader.conversation("../secret"),/ID/);
 assert.equal(calls.length,0);
});
test("selected account ID is sent to individual conversations",async()=>{
 const {reader,calls}=createFake({handle:()=>response({messages:[]})});
 await reader.conversation("12345678-1234-1234-1234-123456789abc");
 const target=calls.at(-1);
 assert.equal(target.opts.headers["ChatGPT-Account-ID"],WORKSPACE_ID);
 assert.match(target.url.pathname,/\/backend-api\/conversations\//);
});
test("missing account membership fails closed before listing",async()=>{
 const urls=[];
 const reader=new ChatReader({sleep:async()=>{},fetchImpl:async(url)=>{
  urls.push(url);
  return response({accounts:[],default_account_id:WORKSPACE_ID});
 }});
 await assert.rejects(reader.list(),e=>e.kind==="format");
 assert.equal(urls.length,1);
});
test("429 blocks new calls without retries",async()=>{
 let count=0;
 const {reader,calls}=createFake({handle:()=>{count++;return response({},429,{"retry-after":"60","content-type":"application/json"});}});
 await assert.rejects(reader.list(),e=>e.status===429);
 await assert.rejects(reader.list(),e=>e.status===429);
 assert.equal(count,1);
 assert.equal(calls.length,2);
});
test("plugin inventory uses HAR query parameters and account header",async()=>{
 const {reader,calls}=createFake({handle:()=>response({plugins:[]})});
 assert.deepEqual(await reader.plugins(),{plugins:[]});
 const c=calls.at(-1);
 assert.equal(c.url.pathname,"/backend-api/ps/plugins/installed");
 assert.equal(c.url.searchParams.get("limit"),"1000");
 assert.equal(c.url.searchParams.get("includeExtensions"),"true");
 assert.equal(c.opts.headers["ChatGPT-Account-ID"],WORKSPACE_ID);
});
test("session endpoint has same account header, no IDs in logs",async()=>{
 const diagnostics=[];
 const {reader,calls}=createFake({
  onDiagnostic:(type,details)=>diagnostics.push({type,...details}),
  handle:()=>response({id:"user-test",email:"private@example.com"})
 });
 const me=await reader.session();
 assert.equal(me.id,"user-test");
 assert.equal(calls.at(-1).url.pathname,"/backend-api/me");
 assert.equal(calls.at(-1).opts.headers["ChatGPT-Account-ID"],WORKSPACE_ID);
 const blob=JSON.stringify(diagnostics);
 assert.doesNotMatch(blob,/private@example.com|11111111-2222-4333-8444-555555555555/);
});
test("non-JSON response is classified without leaking response body",async()=>{
 const diagnostics=[];
 const {reader}=createFake({
  onDiagnostic:(type,details)=>diagnostics.push({type,...details}),
  handle:()=>response(null,200,{"content-type":"text/html"})
 });
 await assert.rejects(reader.plugins(),e=>e.kind==="format"&&e.responseType==="html");
 const failed=diagnostics.find(x=>x.type==="request_failed");
 assert.equal(failed.operation,"plugins");
 assert.equal(failed.status,200);
 assert.equal(failed.responseType,"html");
});
test("message renderer omits system/tool/analysis channels",()=>{
 const m=(id,role,channel,parts)=>({id,author:{role},channel,content:{content_type:"text",parts}});
 const shown=visibleMessages({messages:[
  m("u","user",null,["Hello"]),m("x","tool",null,["SECRET"]),
  m("r","assistant","analysis",["SECRET"]),m("a","assistant","final",["Hi"])
 ]});
 assert.deepEqual(shown.map(x=>x.text),["Hello","Hi"]);
 assert.deepEqual(pageState({page_info:{has_previous_page:true,start_cursor:"k"}}),
  {hasOlder:true,before:"k"});
 assert.equal(listItems({items:[{id:"c",title:"Test"}]}).length,1);
});
