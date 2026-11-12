import {normalizeExport,getMessages,listMetadata} from './model.mjs';
let byId=new Map();
self.addEventListener('message',async({data})=>{
 const {type,requestId}=data??{};
 const send=payload=>self.postMessage({requestId,...payload});
 try{
  if(type==='load'){
   const file=data.file;
   if(!file||typeof file.text!=='function')throw new Error('Select a JSON file.');
   const conversations=normalizeExport(JSON.parse(await file.text()));
   byId=new Map(conversations.map(x=>[x.id,x]));
   send({ok:true,type:'loaded',items:listMetadata(conversations)});
  }else if(type==='conversation'){
   const c=byId.get(String(data.id));
   if(!c)throw new Error('Conversation not found.');
   send({ok:true,type:'conversation',id:c.id,title:c.title,messages:getMessages(c)});
  }else throw new Error('Unknown request');
 }catch(e){send({ok:false,error:String(e?.message??e)});}
});
