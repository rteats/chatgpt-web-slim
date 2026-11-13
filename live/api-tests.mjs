import test from "node:test";
import assert from "node:assert/strict";
import {ChatReader} from "./api.mjs";
import {listItems,visibleMessages,pageState} from "./model.mjs";

const ID="11111111-2222-4333-8444-555555555555"; // synthetic, not user data
const response=(data,status=200,headers={"content-type":"application/json"})=>({
 status,ok:status>=200&&status<300,
 headers:{get:key=>headers[key.toLowerCase()]??null},
 json:async()=>data
});
const createFake=({accountProvider=async()=>ID,handle=()=>response({items:[],total:0}),
 onDiagnostic=()=>{}}={})=>{
 const calls=[];
 const reader=new ChatReader({accountProvider,sleep:async()=>{},onDiagnostic,
  fetchImpl:async(url,opts)=>{
   const call={url:new URL(url),opts};calls.push(call);return handle(call);
  }
 });
 return {reader,calls};
};

test("list uses selected account header without any accounts/check request",async()=>{
 const {reader,calls}=createFake();
 await reader.list();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url.pathname,"/backend-api/conversations");
 assert.equal(calls[0].opts.headers["ChatGPT-Account-ID"],ID);
 assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.credentials,"include");
 assert.equal(calls[0].url.origin,"https://chatgpt.com");
});
test("no account selection fails locally without network requests",async()=>{
 const {reader,calls}=createFake({accountProvider:async()=>null});
 await assert.rejects(reader.list(),e=>e.kind==="authentication"&&e.status===0);
 assert.equal(calls.length,0);
});
test("deduplication and cache avoid duplicate requests",async()=>{
 let reads=0;
 const {reader,calls}=createFake({accountProvider:async()=>{reads++;return ID;}});
 await Promise.all([reader.list(),reader.list()]);await reader.list();
 assert.equal(calls.length,1);
 assert.equal(reads,1);
});
test("clearCache reads latest account selection again",async()=>{
 const {reader,calls}=createFake();
 await reader.list();reader.clearCache();await reader.list();
 assert.equal(calls.length,2);
});
test("invalid IDs never send network requests",async()=>{
 const {reader,calls}=createFake();
 await assert.rejects(reader.conversation("../secret"),/ID/);
 assert.equal(calls.length,0);
});
test("conversation GET includes the active account header",async()=>{
 const {reader,calls}=createFake({handle:()=>response({messages:[]})});
 await reader.conversation("12345678-1234-1234-1234-123456789abc");
 assert.match(calls[0].url.pathname,/\/backend-api\/conversations\//);
 assert.equal(calls[0].opts.headers["ChatGPT-Account-ID"],ID);
});
test("rate-limit failure never automatically retries",async()=>{
 let count=0;
 const {reader,calls}=createFake({handle:()=>{count++;return response({},429,{"retry-after":"60","content-type":"application/json"});}});
 await assert.rejects(reader.list(),e=>e.status===429);
 await assert.rejects(reader.list(),e=>e.status===429);
 assert.equal(count,1);assert.equal(calls.length,1);
});
test("plugin query uses HAR params with selected account",async()=>{
 const {reader,calls}=createFake({handle:()=>response({plugins:[]})});
 assert.deepEqual(await reader.plugins(),{plugins:[]});
 const c=calls[0];
 assert.equal(c.url.pathname,"/backend-api/ps/plugins/installed");
 assert.equal(c.url.searchParams.get("limit"),"1000");
 assert.equal(c.url.searchParams.get("includeExtensions"),"true");
 assert.equal(c.opts.headers["ChatGPT-Account-ID"],ID);
});
test("session probe still works independently without captured account",async()=>{
 const {reader,calls}=createFake({accountProvider:async()=>null,
  handle:()=>response({id:"example",email:"private@example.com"})});
 const me=await reader.session();
 assert.equal(me.id,"example");
 assert.equal(calls.length,1);
 assert.equal(calls[0].url.pathname,"/backend-api/me");
 assert.equal(calls[0].opts.headers["ChatGPT-Account-ID"],undefined);
});
test("non-JSON failure includes only MIME group and status",async()=>{
 const logs=[];
 const {reader}=createFake({onDiagnostic:(event,details)=>logs.push({event,...details}),
 handle:()=>response(null,200,{"content-type":"text/html"})});
 await assert.rejects(reader.plugins(),e=>e.kind==="format"&&e.responseType==="html");
 const fail=logs.find(x=>x.event==="request_failed");
 assert.equal(fail.status,200);assert.equal(fail.responseType,"html");
});
test("workspace identifier never enters diagnostic callback",async()=>{
 const logs=[];
 const {reader}=createFake({onDiagnostic:(event,details)=>logs.push({event,...details})});
 await reader.list();
 assert.doesNotMatch(JSON.stringify(logs),/11111111-2222-4333-8444-555555555555/);
});
test("message renderer hides tool and analysis channels",()=>{
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
