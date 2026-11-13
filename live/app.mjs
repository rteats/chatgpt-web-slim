import {ChatReader,conversationListPath} from "./api.mjs";
import {runSiteProbe} from "./site-probe.mjs";
import {listItems,visibleMessages,pageState} from "./model.mjs";
import {Diagnostics,errorClass} from "./diagnostics.mjs";
import {initNetworkPanel} from "./net-panel.mjs";
const diagnostics=new Diagnostics();
const api=new ChatReader({onDiagnostic:(event,details)=>diagnostics.add(event,details)}),$=s=>document.querySelector(s);
const connect=$("#connect"),more=$("#more"),older=$("#older"),plugins=$("#plugins");
const sessionButton=$("#check-session"),sessionInfo=$("#session-info");
const compareButton=$("#compare"),compareResult=$("#compare-result");
const originalButton=$("#open-original"),accountStatus=$("#account-status");
const search=$("#search"),list=$("#conversations"),messages=$("#messages");
const status=$("#status"),title=$("#title"),count=$("#count"),pluginSummary=$("#plugin-summary");
let items=[],offset=0,total=0,selected=null,rows=[],page=null,busy=false,pluginsBlocked=false;
function report(text,bad=false){status.textContent=text;status.classList.toggle("error",bad);}
function actionFailed(operation,error){diagnostics.add("action_failed",{operation,errorClass:errorClass(error),status:error?.status});report(error.message,true);}
function setBusy(value){
 busy=value;
 for(const b of [connect,more,older,plugins,sessionButton,compareButton,...list.querySelectorAll("button")])
  b.disabled=value||(b===plugins&&pluginsBlocked);
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
 setBusy(true);diagnostics.add("action_started",{operation:"conversations"});report("Получаем список чатов…");
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
  diagnostics.add("action_succeeded",{operation:"conversations",count:items.length,total});
  if(items.length===0){
   diagnostics.add("response_empty",{operation:"conversations",count:0,total});
   report("Ответ HTTP 200, но список пуст. Нажмите «Проверить текущую сессию» и сравните аккаунт с обычным ChatGPT.",true);
  }else report("Загружено "+items.length+" из "+total+" диалогов");
 }catch(error){actionFailed("conversations",error);}
 finally{setBusy(false);renderSidebar();}
}
async function openConversation(item){
 if(busy)return;
 setBusy(true);diagnostics.add("action_started",{operation:"conversation"});report("Читаем сообщения…");
 try{
  const data=await api.conversation(item.id);
  rows=visibleMessages(data);page=pageState(data);selected=item.id;
  title.textContent=typeof data.title==="string"?data.title:item.title;
  renderMessages(false,rows);
  diagnostics.add("action_succeeded",{operation:"conversation",count:rows.length});
  report("Диалог открыт · служебные сообщения скрыты");
 }catch(error){actionFailed("conversation",error);}
 finally{setBusy(false);renderSidebar();}
}
async function loadOlder(){
 if(busy||!selected||!page?.hasOlder||!page.before)return;
 setBusy(true);diagnostics.add("action_started",{operation:"older"});const cursor=page.before;report("Загружаем старые сообщения…");
 try{
  const data=await api.conversation(selected,cursor);
  const known=new Set(rows.map(x=>x.id));
  const earlier=visibleMessages(data).filter(x=>!known.has(x.id));
  rows=[...earlier,...rows];
  const next=pageState(data);
  page=next.before===cursor?{hasOlder:false,before:null}:next;
  renderMessages(true,earlier);
  diagnostics.add("action_succeeded",{operation:"older",count:earlier.length});
  report("Подгружено сообщений: "+earlier.length);
 }catch(error){actionFailed("older",error);}
 finally{setBusy(false);}
}
async function loadPlugins(){
 if(busy)return;
 setBusy(true);diagnostics.add("action_started",{operation:"plugins"});
 try{
  const data=await api.plugins();
  const names=Array.isArray(data.plugins)?data.plugins.map(x=>x?.name).filter(x=>typeof x==="string"):[];
  pluginSummary.textContent="Установлено: "+names.length+(names.length?" · "+names.slice(0,8).join(", "):"");
  diagnostics.add("action_succeeded",{operation:"plugins",count:names.length});
  report("Получены метаданные плагинов, без вызова их инструментов.");
  }catch(error){
  if(error?.status===451){
   pluginsBlocked=true;
   pluginSummary.textContent="HTTP 451: сервер отказал в доступе к каталогу плагинов. Повторные запросы отключены.";
  }
  actionFailed("plugins",error);
 }
 finally{setBusy(false);}

}
function maskedEmail(email){
 if(typeof email!=="string"||!email.includes("@"))return "адрес недоступен";
 const [name,domain]=email.split("@");
 return (name.slice(0,Math.min(2,name.length))+"***@"+domain);
}
async function checkSession(){
 if(busy)return;
 setBusy(true);diagnostics.add("action_started",{operation:"session"});
 report("Проверяем сессию…");
 try{
  const me=await api.session();
  const valid=typeof me?.id==="string"&&me.id.length>0;
  if(!valid)throw new Error("Ответ профиля не содержит ожидаемого ID.");
  // The email is shown locally only; it never enters diagnostics.
  sessionInfo.textContent="Профиль доступен: "+maskedEmail(me.email)+". Сравните с аккаунтом на chatgpt.com.";
  diagnostics.add("action_succeeded",{operation:"session",count:1});
  report("Проверка профиля прошла. Это ещё не гарантирует доступ к истории.");
 }catch(error){
  diagnostics.add("action_failed",{operation:"session",errorClass:errorClass(error),status:error?.status});
  sessionInfo.textContent="Не удалось проверить профиль.";
  report(error.message,true);
 }finally{setBusy(false);}
}
sessionButton.addEventListener("click",checkSession);
function formatProbeResult(result){
 if(result?.kind)return "ошибка "+result.kind;
 return "HTTP "+String(result?.status??"?")+
  ", "+String(result?.count??"?")+" элементов, total="+String(result?.total??"?")+
  " ("+String(result?.responseType??"unknown")+")";
}
async function compareOrigins(){
 if(busy)return;
 setBusy(true);
 compareResult.textContent="Сравнение запущено: один GET из расширения и один из обычной вкладки…";
 try{
  const capture=await chrome.runtime.sendMessage({type:"WEB_SLIM_GET_ACCOUNT"});
  const accountId=capture?.accountId;
  if(!accountId)throw new Error("Нет привязанного аккаунта. Сначала откройте обычный ChatGPT.");
  const tabs=await chrome.tabs.query({url:"https://chatgpt.com/*"});
  const official=tabs.find(t=>t.active&&t.id)||tabs.find(t=>t.id);
  if(!official)throw new Error("Откройте обычный ChatGPT в этом профиле браузера.");
  // Deliberate diagnostic action only, not a background poll or an auth bypass.
  const path=conversationListPath(0);
  const injected=await chrome.scripting.executeScript({
   target:{tabId:official.id},world:"ISOLATED",
   func:runSiteProbe,args:[accountId,path]
  });
  const site=injected?.[0]?.result??{kind:"unavailable"};
  diagnostics.add(site?.kind?"probe_failed":"probe_result",{
   operation:"site",status:site.status,responseType:site.responseType,
   count:site.count,total:site.total,errorClass:site.kind==="network"?"network":"unknown"
  });
  api.clearCache();
  let extension;
  try{
   const data=await api.list(0);
   extension={
    status:200,responseType:"json",
    count:Array.isArray(data?.items)?data.items.length:undefined,
    total:Number.isSafeInteger(data?.total)?data.total:undefined
   };
  }catch(error){
   extension={status:error?.status||undefined,kind:error?.kind??"unknown"};
  }
  diagnostics.add(extension.kind?"probe_failed":"probe_result",{
   operation:"extension",status:extension.status,responseType:extension.responseType,
   count:extension.count,total:extension.total,errorClass:extension.kind
  });
  compareResult.textContent="Обычный сайт: "+formatProbeResult(site)+
   " | Расширение: "+formatProbeResult(extension);
  report("Сравнение завершено. Скачайте диагностический JSON — в нём только статусы и счётчики.");
 }catch(error){
  diagnostics.add("probe_failed",{operation:"site",errorClass:"unknown"});
  compareResult.textContent="Сравнение не удалось: "+String(error?.message??"Ошибка");
  report("Проверка недоступна. Проверьте открытую вкладку ChatGPT.",true);
 }finally{setBusy(false);}
}
compareButton.addEventListener("click",compareOrigins);
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

async function refreshAccountStatus(){
 try{
  const result=await chrome.runtime.sendMessage({type:"WEB_SLIM_GET_ACCOUNT"});
  accountStatus.textContent=result?.accountId?
   "Аккаунт определён из запросов официального сайта. Можно подключаться.":
   "Аккаунт ещё не определён. Откройте обычный ChatGPT, дождитесь загрузки истории, затем вернитесь.";
 }catch{
  accountStatus.textContent="Не удалось прочитать состояние расширения. Обновите его в chrome://extensions.";
 }
}
originalButton.addEventListener("click",()=>{
 chrome.tabs.create({url:"https://chatgpt.com/"});
});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==="session"&&changes.capturedAccountId)refreshAccountStatus();
});
refreshAccountStatus();

$("#export-logs").addEventListener("click",()=>diagnostics.download());
window.addEventListener("error",()=>diagnostics.add("runtime_error",{operation:"unknown"}));
window.addEventListener("unhandledrejection",()=>diagnostics.add("unhandled_rejection",{operation:"unknown"}));

// Monitoring is always off by default; user must explicitly start it.
initNetworkPanel();
