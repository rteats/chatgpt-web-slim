/** Conversion of official ChatGPT export data. No network. */
export function normalizeExport(input) {
 const list=Array.isArray(input)?input:(Array.isArray(input?.conversations)?input.conversations:null);
 if(!list) throw new Error('Expected a conversations.json export (an array of conversations).');
 return list.filter(x=>x && typeof x==='object').map((raw,index)=>({
  id:String(raw.id??raw.conversation_id??index),
  title:typeof raw.title==='string'&&raw.title.trim()?raw.title:'Untitled conversation',
  updatedAt:Number(raw.update_time??raw.create_time??0)||0,
  mapping:raw.mapping&&typeof raw.mapping==='object'?raw.mapping:{},
  currentNode:raw.current_node??null
 }));
}
export function asText(message) {
 const c=message?.content;
 if(!c||typeof c!=='object') return '';
 if(Array.isArray(c.parts))return c.parts.map(part=>{
  if(typeof part==='string')return part;
  if(part&&typeof part==='object'){
   if(typeof part.text==='string')return part.text;
   if(typeof part.content==='string')return part.content;
   if(part.content_type==='image_asset_pointer'||part.asset_pointer)return '[Image attachment]';
   if(part.content_type==='audio_asset_pointer')return '[Audio attachment]';
   if(part.content_type==='video')return '[Video attachment]';
   return '[Non-text content]';
  }
  return '';
 }).filter(Boolean).join('\n');
 return typeof c.text==='string'?c.text:'';
}
export function getMessages(conversation){
 const mapping=conversation.mapping;
 if(!mapping||typeof mapping!=='object')return [];
 const nodes=Object.values(mapping).filter(x=>x&&typeof x==='object');
 const byId=new Map(nodes.map(x=>[String(x.id),x]));
 let node=conversation.currentNode?(mapping[conversation.currentNode]??byId.get(String(conversation.currentNode))):null;
 if(!node){
  const parents=new Set(nodes.map(x=>x.parent).filter(Boolean));
  node=nodes.findLast(x=>!parents.has(x.id))??nodes.at(-1);
 }
 const path=[],visited=new Set();
 while(node&&!visited.has(String(node.id))){
  visited.add(String(node.id));
  const msg=node.message,role=msg?.author?.role;
  if(role==='user'||role==='assistant'){
   const content=asText(msg);
   if(content.trim())path.push({id:String(msg.id??node.id),role,text:content});
  }
  node=node.parent?(mapping[node.parent]??byId.get(String(node.parent))):null;
 }
 return path.reverse();
}
export function listMetadata(conversations){
 return conversations.map(({id,title,updatedAt})=>({id,title,updatedAt}))
  .sort((a,b)=>b.updatedAt-a.updatedAt);
}
