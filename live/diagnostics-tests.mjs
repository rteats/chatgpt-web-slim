import test from "node:test";
import assert from "node:assert/strict";
import {Diagnostics,errorClass} from "./diagnostics.mjs";
test("logs only allowlisted fields and drops private content",()=>{
 const d=new Diagnostics({now:()=>1700000000000});
 d.add("request_failed",{operation:"conversation",status:403,durationMs:123.2,
  url:"https://chatgpt.com/secret",conversationId:"abc",token:"super-secret",
  title:"Sensitive chat",errorMessage:"secret"});
 d.add("does_not_exist",{operation:"conversation"});
 const exported=JSON.stringify(d.snapshot());
 assert.equal(d.events.length,2);
 for(const item of ["super-secret","Sensitive chat","/secret","abc","errorMessage"]){
  assert.equal(exported.includes(item),false,item);
 }
 assert.match(exported,/"status":403/);
 assert.match(exported,/"durationMs":123/);
 assert.equal(errorClass({status:401}),"authentication");
});
test("bounded ring buffer and no arbitrary event labels",()=>{
 const d=new Diagnostics({now:()=>1700000000000,limit:4});
 for(let i=0;i<50;i++)d.add("action_succeeded",{operation:"conversations",count:i});
 assert.equal(d.events.length,4);
 assert.equal(d.events.at(-1).count,49);
});

test("diagnostics record only MIME group and session outcome, not actual account details",()=>{
 const d=new Diagnostics({now:()=>1700000000000});
 d.add("request_failed",{operation:"plugins",status:200,responseType:"html",
  email:"private@example.com",responseBody:"secret",url:"https://chatgpt.com/private"});
 d.add("response_empty",{operation:"conversations",count:0,total:0});
 d.add("action_succeeded",{operation:"session",count:1,email:"private@example.com"});
 const json=JSON.stringify(d.snapshot());
 assert.match(json,/"responseType":"html"/);
 assert.match(json,/"response_empty"/);
 assert.doesNotMatch(json,/private@example.com|responseBody|https:\/\/chatgpt.com/);
});

test("account discovery logs a count but never an account identifier",()=>{
 const d=new Diagnostics({now:()=>1700000000000});
 d.add("account_resolved",{operation:"accounts",count:1,
  accountId:"11111111-2222-4333-8444-555555555555"});
 assert.equal(d.events.at(-1).event,"account_resolved");
 assert.equal(d.events.at(-1).operation,"accounts");
 assert.equal(d.events.at(-1).count,1);
 assert.doesNotMatch(JSON.stringify(d.snapshot()),/11111111-2222-4333-8444-555555555555/);
});
