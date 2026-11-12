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
