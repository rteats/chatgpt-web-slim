import test from "node:test";
import assert from "node:assert/strict";
import {SSEDecoder,FinalTextProjector} from "./stream.mjs";
import {buildTextDraft,AttachmentState} from "./send-model.mjs";
const event=(kind,data)=>"event: "+kind+"\ndata: "+JSON.stringify(data)+"\n\n";
test("stream merges patch frames lacking o:patch and hides system/reasoning",()=>{
 const seen=[];
 const projector=new FinalTextProjector(x=>seen.push(x));
 const decoder=new SSEDecoder(x=>projector.consume(x));
 const stream=event("delta",{v:{message:{id:"sys",author:{role:"system"},content:{content_type:"text",parts:["SECRET"]}}}})
 +event("delta",{v:{message:{id:"r",author:{role:"assistant"},channel:"analysis",content:{content_type:"text",parts:["HIDDEN"]}}}})
 +event("delta",{v:{message:{id:"fin",author:{role:"assistant"},channel:"final",recipient:"all",content:{content_type:"text",parts:[""]}}}})
 +event("delta",{o:"patch",v:[{o:"append",p:"/message/content/parts/0",v:"Hi "}]})
 +event("delta",{v:[{o:"append",p:"/message/content/parts/0",v:"🙂"}]})
 +event("delta",{type:"message_stream_complete"});
 const b=new TextEncoder().encode(stream);
 for(let i=0;i<b.length;i+=2)decoder.push(b.slice(i,i+2));
 decoder.finish();
 assert.equal(seen.at(-1).text,"Hi 🙂");
 assert.equal(seen.at(-1).done,true);
 assert.ok(seen.every(x=>!x.text.includes("SECRET")&&!x.text.includes("HIDDEN")));
});
test("limits frame size",()=>assert.throws(()=>new SSEDecoder(()=>{},{maxFrameChars:20}).push("x".repeat(21)),/Oversized/));
test("validates text draft but never sends",()=>{
 const d=buildTextDraft({text:"Hello",model:"gpt-6",parentMessageId:"abcdefgh",messageId:"test-msg",now:42});
 assert.equal(d.messages[0].content.parts[0],"Hello");
 assert.throws(()=>buildTextDraft({text:" ",model:"gpt-6",parentMessageId:"abcdefgh"}),/Invalid/);
});
test("attachment stages require correct sequence",()=>{
 const a=new AttachmentState("img.png","image/png",1000);
 assert.throws(()=>a.step("attached"),/Illegal/);
 for(const stage of ["registered","uploaded","processed","attached"])a.step(stage);
 assert.equal(a.stage,"attached");
});
