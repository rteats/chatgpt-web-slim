/** Non-networking schema/validation from the captured sending flow.
 * No security tokens, anti-bot solutions, request dispatch or session spoofing.
 */
export function buildTextDraft({text,model,conversationId=null,parentMessageId,
 timezone="UTC",offsetMinutes=0,messageId=crypto.randomUUID(),now=Date.now()/1000}){
 if(typeof text!=="string"||!text.trim()||text.length>20000)throw new Error("Invalid text");
 if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(model))throw new Error("Invalid model");
 if(typeof parentMessageId!=="string"||!/^[\w-]{8,128}$/.test(parentMessageId))throw new Error("Invalid parent ID");
 if(conversationId!==null&&!/^[\w-]{8,128}$/.test(conversationId))throw new Error("Invalid conversation ID");
 if(!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>840)throw new Error("Invalid UTC offset");
 return {
  action:"next",model,parent_message_id:parentMessageId,
  ...(conversationId?{conversation_id:conversationId}:{}),
  timezone,timezone_offset_min:offsetMinutes,is_do_not_remember:false,
  messages:[{
   id:messageId,author:{role:"user",name:null,metadata:{}},channel:null,
   recipient:"all",status:"finished_successfully",create_time:now,
   update_time:null,end_turn:null,weight:1,
   content:{content_type:"text",parts:[text]},metadata:{}
  }]
 };
}
export class AttachmentState {
 constructor(name,type,size) {
  if(typeof name!=="string"||!name||name.length>255)throw new Error("Invalid filename");
  if(typeof type!=="string"||!type)throw new Error("Invalid MIME type");
  if(!Number.isSafeInteger(size)||size<=0)throw new Error("Invalid size");
  this.name=name;this.type=type;this.size=size;this.stage="new";
 }
 step(stage){
  const next={new:"registered",registered:"uploaded",uploaded:"processed",processed:"attached"};
  if(next[this.stage]!==stage)throw new Error("Illegal attachment transition");
  this.stage=stage;
 }
}
