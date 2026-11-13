/** Passive SSE decoder and final-channel projector; does not issue requests. */
export class SSEDecoder {
  constructor(onEvent, { maxFrameChars=1000000 }={}) {
    if (typeof onEvent!=="function") throw new TypeError("onEvent required");
    this.onEvent=onEvent; this.maxFrameChars=maxFrameChars;
    this.decoder=new TextDecoder(); this.buffer="";
  }
  push(bytes) {
    this.buffer+=(typeof bytes==="string" ? bytes:this.decoder.decode(bytes,{stream:true}));
    this.buffer=this.buffer.replace(/\r\n/g,"\n");
    let end;
    while((end=this.buffer.indexOf("\n\n"))!==-1) {
      if(end>this.maxFrameChars)throw new Error("Oversized event");
      const frame=this.buffer.slice(0,end); this.buffer=this.buffer.slice(end+2);
      this.#emit(frame);
    }
    if(this.buffer.length>this.maxFrameChars)throw new Error("Oversized buffer");
  }
  finish(){
    this.push(this.decoder.decode());
    if(this.buffer.trim())this.#emit(this.buffer);
    this.buffer="";
  }
  #emit(frame) {
    let event="message"; const lines=[];
    for(const row of frame.split("\n")){
      if(row.startsWith("event:"))event=row.slice(6).trim();
      if(row.startsWith("data:"))lines.push(row.slice(5).replace(/^ /,""));
    }
    if(!lines.length)return;
    const content=lines.join("\n");
    if(content==="[DONE]"){this.onEvent({event,done:true});return;}
    try{this.onEvent({event,data:JSON.parse(content)});}
    catch{this.onEvent({event,malformed:true});}
  }
}
export class FinalTextProjector {
  constructor(onUpdate){this.onUpdate=onUpdate;this.message=null;this.text="";this.done=false;}
  #update(){this.onUpdate({id:this.message?.id??null,text:this.text,done:this.done});}
  consume(frame){
    if(frame.done||frame.data?.type==="message_stream_complete"){
      if(this.message){this.done=true;this.#update();}return;
    }
    const d=frame.data;
    if(!d||frame.event!=="delta")return;
    const snapshot=d.v?.message;
    if(snapshot&&typeof snapshot==="object"){
      const allowed=snapshot.author?.role==="assistant"&&snapshot.channel==="final"&&
        (!snapshot.recipient||snapshot.recipient==="all")&&
        ["text","multimodal_text"].includes(snapshot.content?.content_type);
      if(!allowed){this.message=null;return;}
      this.message=snapshot;
      this.text=typeof snapshot.content?.parts?.[0]==="string"?snapshot.content.parts[0]:"";
      this.done=Boolean(snapshot.end_turn);
      this.#update();return;
    }
    // Subsequent frames may omit outer "o: patch".
    if(!this.message||!Array.isArray(d.v))return;
    let changed=false;
    for(const p of d.v){
      if(p.p==="/message/content/parts/0"&&typeof p.v==="string"){
        if(p.o==="append"){this.text+=p.v;changed=true;}
        if(p.o==="replace"){this.text=p.v;changed=true;}
      }
      if(p.p==="/message/end_turn"&&p.v===true){this.done=true;changed=true;}
    }
    if(changed)this.#update();
  }
}
