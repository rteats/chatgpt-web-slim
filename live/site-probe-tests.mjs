import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {runSiteProbe} from "./site-probe.mjs";

const ACCOUNT="11111111-2222-4333-8444-555555555555";
const PATH="/backend-api/conversations?limit=20&offset=0";
function createContext(reply){
 const requests=[];
 const exec=vm.runInNewContext("("+runSiteProbe.toString()+")",{
  location:{origin:"https://chatgpt.com"},
  fetch:async(url,opts)=>{
   requests.push({url,opts});
   return {
    status:reply.status??200,ok:(reply.status??200)<400,
    headers:{get:()=>reply.contentType??"application/json"},
    json:async()=>reply.body??{items:[],total:0}
   };
  }
 });
 return {exec,requests};
}
test("returns only count and status without conversation content",async()=>{
 const {exec,requests}=createContext({
  body:{items:[{id:"PRIVATE-ID",title:"PRIVATE-TITLE"}],total:55}
 });
 const result=await exec(ACCOUNT,PATH);
 assert.equal(result.status,200);
 assert.equal(result.count,1);
 assert.equal(result.total,55);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE-ID|PRIVATE-TITLE/);
 assert.equal(requests[0].url,"https://chatgpt.com"+PATH);
 assert.equal(requests[0].opts.headers["ChatGPT-Account-ID"],ACCOUNT);
 assert.equal(requests[0].opts.credentials,"include");
});
test("rejects invalid paths and IDs before any fetch",async()=>{
 const {exec,requests}=createContext({});
 const a=await exec("not-an-account",PATH);
 const b=await exec(ACCOUNT,"/backend-api/ps/plugins/installed");
 assert.equal(a.kind,"validation");
 assert.equal(b.kind,"validation");
 assert.equal(requests.length,0);
});
test("only returns status and type for denied request",async()=>{
 const {exec}=createContext({status:451,contentType:"text/html"});
 const result=await exec(ACCOUNT,PATH);
 assert.equal(result.status,451);
 assert.equal(result.responseType,"html");
 assert.equal(result.count,undefined);
});
test("unexpected payload structure yields an allowlisted shape marker",async()=>{
 const {exec}=createContext({body:{error:"PRIVATE-CONTENT"}});
 const result=await exec(ACCOUNT,PATH);
 assert.equal(result.itemsShape,"other");
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE-CONTENT/);
});
