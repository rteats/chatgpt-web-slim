import test from "node:test";
import assert from "node:assert/strict";
import {ChatReader} from "./api.mjs";
import {listItems,visibleMessages,pageState} from "./model.mjs";
const response=(data,status=200,headers={"content-type":"application/json"})=>({
 status,ok:status>=200&&status<300,
 headers:{get:key=>headers[key.toLowerCase()]??null},
 json:async()=>data
});
test("list uses observed GET endpoint, browser credentials and only chatgpt.com",async()=>{
 const calls=[];
 const api=new ChatReader({fetchImpl:async(url,opts)=>{calls.push({url,opts});return response({items:[],total:0});}});
 await api.list();
 assert.equal(calls.length,1);
 assert.equal(new URL(calls[0].url).origin,"https://chatgpt.com");
 assert.equal(new URL(calls[0].url).pathname,"/backend-api/conversations");
 assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.credentials,"include");
});
test("invalid conversation ids never hit network",async()=>{
 let count=0;
 const api=new ChatReader({fetchImpl:async()=>{count++;return response({});}});
 assert.throws(()=>api.conversation("../secret"),/ID/);
 assert.equal(count,0);
});
test("deduplication and cache avoid redundant network requests",async()=>{
 let count=0;
 const api=new ChatReader({fetchImpl:async()=>{count++;return response({items:[],total:0});}});
 await Promise.all([api.list(),api.list()]);
 await api.list();
 assert.equal(count,1);
});
test("rate-limit response stops auto-retries",async()=>{
 let count=0;
 const api=new ChatReader({fetchImpl:async()=>{count++;return response({},429,{"retry-after":"60","content-type":"application/json"});}});
 await assert.rejects(api.list(),e=>e.status===429);
 await assert.rejects(api.list(),e=>e.status===429);
 assert.equal(count,1);
});
test("installed plugins are read-only GET requests",async()=>{
 const requests=[];
 const api=new ChatReader({fetchImpl:async(url,opts)=>{requests.push([url,opts.method]);return response({plugins:[]});}});
 assert.deepEqual(await api.plugins(),{plugins:[]});
 assert.equal(new URL(requests[0][0]).pathname,"/backend-api/ps/plugins/installed");
 assert.equal(requests[0][1],"GET");
});
test("model hides tool and internal channels",()=>{
 const m=(id,role,channel,parts)=>({id,author:{role},channel,content:{content_type:"text",parts}});
 const items=visibleMessages({messages:[m("u","user",null,["Hello"]),m("x","tool",null,["SECRET"]),
  m("r","assistant","analysis",["SECRET"]),m("a","assistant","final",["Hi"])]});
 assert.deepEqual(items.map(x=>x.text),["Hello","Hi"]);
 assert.deepEqual(pageState({page_info:{has_previous_page:true,start_cursor:"k"}}),{hasOlder:true,before:"k"});
 assert.equal(listItems({items:[{id:"c",title:"Test"}]}).length,1);
});
