/** Safe, read-only projection of conversation API results. */
export function listItems(data){
 if(!data||!Array.isArray(data.items))throw new Error("Неверный формат списка");
 return data.items.filter(x=>x&&typeof x.id==="string").map(x=>({
  id:x.id,title:typeof x.title==="string"&&x.title.trim()?x.title:"Без названия",
  updatedAt:Number(x.update_time)||0
 }));
}
export function messageText(msg){
 const c=msg?.content;
 if(!c||!["text","multimodal_text"].includes(c.content_type)||!Array.isArray(c.parts))return "";
 return c.parts.map(p=>typeof p==="string"?p:
  typeof p?.text==="string"?p.text:p?.asset_pointer?"[Вложение]":"").filter(Boolean).join("\n");
}
export function visibleMessages(data){
 if(!data||!Array.isArray(data.messages))throw new Error("Неверный формат сообщений");
 const rows=[];
 for(const msg of data.messages){
  const role=msg?.author?.role;
  if(role!=="user"&&role!=="assistant")continue;
  if(role==="assistant"&&msg.channel!=="final"&&
    !(!msg.channel&&(msg.recipient==="all"||!msg.recipient)))continue;
  const text=messageText(msg);
  if(text.trim())rows.push({id:String(msg.id||""),role,text});
 }
 return rows;
}
export function pageState(data){
 return {hasOlder:data?.page_info?.has_previous_page===true,
  before:typeof data?.page_info?.start_cursor==="string"?data.page_info.start_cursor:null};
}
