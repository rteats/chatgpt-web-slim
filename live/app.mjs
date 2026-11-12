import {ChatReader} from "./api.mjs";
import {listItems,visibleMessages,pageState} from "./model.mjs";
const api=new ChatReader(),$=s=>document.querySelector(s);
const connect=$("#connect"),more=$("#more"),older=$("#older"),plugins=$("#plugins");
const search=$("#search"),list=$("#conversations"),messages=$("#messages");
const status=$("#status"),title=$("#title"),count=$("#count"),pluginSummary=$("#plugin-summary");
let items=[],offset=0,total=0,selected=null,rows=[],page=null,busy=false;
function report(text,bad=false){status.textContent=text;status.classList.toggle("error",bad);}
function setBusy(value){
 busy=value;
 for(const b of [connect,more,older,plugins,...list.querySelectorAll("button")])b.disabled=value;
}
function makeMessage(row){
 const article=document.createElement("article");
 article.className="message "+row.role;
 const role=document.createElement("div");
 role.className="role";role.textContent=row.role==="user"?"Вы":"ChatGPT";
 const content=document.createElement("div");
 content.className="content";content.textContent=row.text;
 article.append(role,content);return article;
}
function renderSidebar(){
 const query=search.value.trim().toLocaleLowerCase();
 const fragment=document.createDocumentFragment();
 for(const item of items.filter(x=>x.title.toLocaleLowerCase().includes(query))){
  const button=document.createElement("button");
  button.type="button";button.className="chat"+(selected===item.id?" active":"");
  button.textContent=item.title;button.title=item.title;button.disabled=busy;
  button.addEventListener("click",()=>openConversation(item));
  fragment.append(button);
 }
 list.replaceChildren(fragment);
 more.hidden=items.length>=total||!items.length;
}
function renderMessages(prepend,fresh){
 const fragment=document.createDocumentFragment();
 for(const row of fresh)fragment.append(makeMessage(row));
 if(prepend){
  const previousHeight=messages.scrollHeight,previousTop=messages.scrollTop;
  messages.prepend(fragment);
  messages.scrollTop=previousTop+messages.scrollHeight-previousHeight;
 }else{
  messages.replaceChildren(fragment);
  messages.scrollTop=messages.scrollHeight;
 }
 count.textContent=rows.length+" сообщений";
 older.hidden=!(page?.hasOlder&&page.before);
}
async function loadList(reset){
 if(busy)return;
 setBusy(true);report("Получаем список чатов…");
 if(reset){api.clearCache();offset=0;}
 try{
  const data=await api.list(offset);
  const batch=listItems(data);
  if(reset){
   items=[];selected=null;rows=[];page=null;
   title.textContent="Выберите диалог";messages.replaceChildren();count.textContent="";
  }
  const known=new Set(items.map(x=>x.id));
  for(const item of batch)if(!known.has(item.id)){items.push(item);known.add(item.id);}
  offset+=20;total=Number(data.total)||items.length;
  report("Загружено "+items.length+" из "+total+" диалогов");
 }catch(error){report(error.message,true);}
 finally{setBusy(false);renderSidebar();}
}
async function openConversation(item){
 if(busy)return;
 setBusy(true);report("Читаем сообщения…");
 try{
  const data=await api.conversation(item.id);
  rows=visibleMessages(data);page=pageState(data);selected=item.id;
  title.textContent=typeof data.title==="string"?data.title:item.title;
  renderMessages(false,rows);
  report("Диалог открыт · служебные сообщения скрыты");
 }catch(error){report(error.message,true);}
 finally{setBusy(false);renderSidebar();}
}
async function loadOlder(){
 if(busy||!selected||!page?.hasOlder||!page.before)return;
 setBusy(true);const cursor=page.before;report("Загружаем старые сообщения…");
 try{
  const data=await api.conversation(selected,cursor);
  const known=new Set(rows.map(x=>x.id));
  const earlier=visibleMessages(data).filter(x=>!known.has(x.id));
  rows=[...earlier,...rows];
  const next=pageState(data);
  page=next.before===cursor?{hasOlder:false,before:null}:next;
  renderMessages(true,earlier);
  report("Подгружено сообщений: "+earlier.length);
 }catch(error){report(error.message,true);}
 finally{setBusy(false);}
}
async function loadPlugins(){
 if(busy)return;
 setBusy(true);
 try{
  const data=await api.plugins();
  const names=Array.isArray(data.plugins)?data.plugins.map(x=>x?.name).filter(x=>typeof x==="string"):[];
  pluginSummary.textContent="Установлено: "+names.length+(names.length?" · "+names.slice(0,8).join(", "):"");
  report("Получены метаданные плагинов, без вызова их инструментов.");
 }catch(error){report(error.message,true);}
 finally{setBusy(false);}
}
connect.addEventListener("click",()=>loadList(true));
more.addEventListener("click",()=>loadList(false));
older.addEventListener("click",loadOlder);
plugins.addEventListener("click",loadPlugins);
search.addEventListener("input",renderSidebar);
document.addEventListener("keydown",e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
  e.preventDefault();search.focus();search.select();
 }
});
