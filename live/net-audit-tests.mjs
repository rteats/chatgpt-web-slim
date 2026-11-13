import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
 describeEndpoint,headerNames,classifySource,startObservation,
 completeObservation,compareObservations
} from "./net-audit.mjs";
import {readFirstPartyAccountHeader} from "./account-capture.mjs";
const ORIGIN="chrome-extension://extension-id";
const FIRSTPARTY="https://chatgpt.com";

test("whitelists endpoints and query names without any values or conversation IDs",()=>{
 const value="private-conversation-id-abc";
 const path=describeEndpoint(FIRSTPARTY+"/backend-api/conversations/"+value+
  "?before=secret-cursor&num_turns=10&unexpected=PRIVATE");
 assert.deepEqual(path,{route:"conversations.detail",queryNames:["before","num_turns"]});
 assert.doesNotMatch(JSON.stringify(path),/private-conversation|secret-cursor|PRIVATE/);
 assert.equal(describeEndpoint("https://not-chatgpt.com/backend-api/conversations"),null);
 assert.equal(describeEndpoint(FIRSTPARTY+"/backend-api/unknown/private"),null);
});
test("header parser records names only, drops invalid names and values",()=>{
 const headers=headerNames([
  {name:"Authorization",value:"SECRET-TOKEN"},
  {name:"ChatGPT-Account-ID",value:"PRIVATE-ID"},
  {name:"X-Long",value:"USER MESSAGE"}, {name:"x-long",value:"dup"},
  {name:"PRIVATE\nToken",value:"BAD"}
 ]);
 assert.deepEqual(headers,["authorization","chatgpt-account-id"]);
 assert.doesNotMatch(JSON.stringify(headers),/SECRET|PRIVATE-ID|USER MESSAGE/);
});
test("accepts only selected official tab and own extension initiator",()=>{
 const base={url:FIRSTPARTY+"/backend-api/conversations",method:"GET",
  requestHeaders:[{name:"Accept",value:"application/json"}],tabId:12};
 assert.equal(classifySource({...base,initiator:FIRSTPARTY},ORIGIN,12),"official");
 assert.equal(classifySource({...base,initiator:FIRSTPARTY},ORIGIN,13),null);
 assert.equal(classifySource({...base,initiator:"chrome-extension://other"},ORIGIN,12),null);
 assert.equal(classifySource({...base,initiator:ORIGIN},ORIGIN,12),"extension");
});
test("completed observations include only HTTP status, MIME category and duration",()=>{
 const start=startObservation({
  url:FIRSTPARTY+"/backend-api/conversations?limit=20&token=PRIVATE",
  method:"GET",tabId:9,initiator:FIRSTPARTY,
  requestHeaders:[{name:"Cookie",value:"PRIVATE COOKIE"}]
 },ORIGIN,9,1);
 const record=completeObservation(start,{
  statusCode:200,timeStamp:130,_startedAt:100,
  responseHeaders:[{name:"Content-Type",value:"application/json; charset=utf-8"},
   {name:"Set-Cookie",value:"PRIVATE TOKEN"}]
 });
 assert.equal(record.status,200);
 assert.equal(record.responseType,"json");
 assert.equal(record.durationMs,30);
 assert.deepEqual(record.queryNames,["limit"]);
 assert.doesNotMatch(JSON.stringify(record),/PRIVATE|Set-Cookie|charset/);
});
test("compares official and extension visible headers without values",()=>{
 const records=[
  {route:"conversations.list",method:"GET",source:"official",headerNames:["accept","chatgpt-account-id","x-chatgpt-client"],
    queryNames:["limit","offset"],status:200},
  {route:"conversations.list",method:"GET",source:"extension",headerNames:["accept","chatgpt-account-id"],
    queryNames:["limit"],status:200}
 ];
 const comparison=compareObservations(records)[0];
 assert.deepEqual(comparison.onlyOfficialHeaders,["x-chatgpt-client"]);
 assert.deepEqual(comparison.onlyOfficialQueryNames,["offset"]);
 assert.deepEqual(comparison.onlyExtensionHeaders,[]);
});
test("monitor never activates without explicit start and saves only sanitized records",async()=>{
 const storage={},callbacks={};
 const on=(name)=>({addListener(fn){callbacks[name]=fn;}});
 const chrome={
  runtime:{id:"extension-id",getURL:()=>ORIGIN+"/",onMessage:on("onMessage")},
  webRequest:{
   onBeforeSendHeaders:on("onBeforeSendHeaders"),onSendHeaders:on("onSendHeaders"),
   onCompleted:on("onCompleted"),onErrorOccurred:on("onErrorOccurred")
  },
  storage:{session:{
   async get(key){return {[key]:storage[key]};},
   async set(value){Object.assign(storage,value);},
   async remove(key){delete storage[key];}
  }},
  tabs:{async get(tabId){return {id:tabId,url:FIRSTPARTY+"/"};}}
 };
 const script=fs.readFileSync(new URL("./background.js",import.meta.url),"utf8")
  .replace(/^import .*;\n/gm,"");
 vm.runInNewContext(script,{
  chrome,URL,Date,Number,Map,Promise,Math,
  readFirstPartyAccountHeader,startObservation,completeObservation,compareObservations
 });
 const send=type=>new Promise(resolve=>callbacks.onMessage({
  type,tabId:7
 },{id:"extension-id"},resolve));
 const makeDetails=(requestId,source)=>({
  requestId,initiator:source,tabId:7,method:"GET",timeStamp:100,
  url:FIRSTPARTY+"/backend-api/conversations?limit=20",
  requestHeaders:[{name:"Accept",value:"application/json"},{name:"Cookie",value:"PRIVATE"}]
 });
 // Listener is silent until explicit consent.
 callbacks.onSendHeaders(makeDetails("pre",FIRSTPARTY));
 callbacks.onCompleted({requestId:"pre",statusCode:200,timeStamp:130,
  responseHeaders:[{name:"Content-Type",value:"application/json"}]});
 assert.equal((await send("WEB_SLIM_AUDIT_GET")).report.count,0);
 assert.equal((await send("WEB_SLIM_AUDIT_START")).ok,true);
 const originRequest=makeDetails("site",FIRSTPARTY);
 callbacks.onSendHeaders(originRequest);
 await Promise.resolve();
 callbacks.onCompleted({requestId:"site",statusCode:200,timeStamp:130,
  responseHeaders:[{name:"Content-Type",value:"application/json"}]});
 const extensionRequest=makeDetails("ext",ORIGIN);
 callbacks.onSendHeaders(extensionRequest);
 await Promise.resolve();
 callbacks.onCompleted({requestId:"ext",statusCode:200,timeStamp:150,
  responseHeaders:[{name:"Content-Type",value:"application/json"}]});
 const stopped=await send("WEB_SLIM_AUDIT_STOP");
 assert.equal(stopped.ok,true);
 assert.equal(stopped.report.records.length,2);
 assert.deepEqual([...new Set(stopped.report.records.map(x=>x.source))].sort(),
  ["extension","official"]);
 assert.doesNotMatch(JSON.stringify(stopped.report),/PRIVATE|requestId|tabId|secret/);
 assert.equal((await send("WEB_SLIM_AUDIT_GET")).report.enabled,false);
});
