/** Explicit, user-controlled network metadata recorder UI. */
export function initNetworkPanel(){
 const $=s=>document.querySelector(s);
 const tabsControl=$("#network-tab");
 const start=$("#network-start"),stop=$("#network-stop"),
  download=$("#network-download"),clear=$("#network-clear");
 const refresh=$("#network-refresh-tabs");
 const status=$("#network-status"),summary=$("#network-summary");
 if(!tabsControl||!start||!stop||!download||!clear)return;

 let report=null;
 const request=async(type,extra={})=>{
  const response=await chrome.runtime.sendMessage({type,...extra});
  if(!response?.ok)throw new Error(response?.error||"Ошибка расширения");
  return response.report;
 };
 const inform=(value)=>{status.textContent=value;};
 const render=(next)=>{
  report=next;
  const count=Number(next?.count)||0;
  const running=next?.enabled===true;
  start.disabled=running;stop.disabled=!running;
  download.disabled=running||count===0;
  clear.disabled=running;tabsControl.disabled=running;refresh.disabled=running;
  inform(running?
   "Запись идёт. Переключись на указанную вкладку ChatGPT, открой 2–3 диалога, затем вернись в Web Slim и нажми «Подключиться». После этого останови запись.":
   "Запись выключена. "+count+" запросов в отчёте. Причина остановки: "+
    (next?.endedReason||"не запускалась")+".");
  const pairs=Array.isArray(next?.comparisons)?next.comparisons:[];
  const summaryLines=pairs.slice(0,10).map(pair=>{
   const a=pair.officialCount,b=pair.extensionCount;
   const extra=pair.onlyOfficialHeaders.length+
    pair.onlyExtensionHeaders.length+
    pair.onlyOfficialQueryNames.length+
    pair.onlyExtensionQueryNames.length;
   return pair.method+" "+pair.route+": сайт "+a+", Web Slim "+b+
    ", отличий имён "+extra;
  });
  summary.textContent=summaryLines.join("\n");
 };
 const getState=async()=>{
  try{render(await request("WEB_SLIM_AUDIT_GET"));}
  catch{inform("Не удалось получить состояние сетевого анализатора.");}
 };
 const loadTabs=async()=>{
  const previously=tabsControl.value;
  tabsControl.replaceChildren();
  const available=await chrome.tabs.query({url:"https://chatgpt.com/*"});
  available.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));
  for(let i=0;i<available.length;i++){
   const opt=document.createElement("option");
   opt.value=String(available[i].id);
   opt.textContent="Обычный ChatGPT — вкладка "+String(i+1);
   tabsControl.append(opt);
  }
  if(available.some(t=>String(t.id)===previously))tabsControl.value=previously;
  if(!available.length){
   const opt=document.createElement("option");
   opt.value="";opt.textContent="Открой обычный ChatGPT";
   tabsControl.append(opt);
   start.disabled=true;
  }else if(!report?.enabled)start.disabled=false;
 };
 start.addEventListener("click",async()=>{
  try{
   const tabId=Number(tabsControl.value);
   if(!Number.isInteger(tabId)||tabId<=0)throw new Error("Сначала открой ChatGPT в обычной вкладке.");
   render(await request("WEB_SLIM_AUDIT_START",{tabId}));
  }catch(error){inform("Начать запись не удалось: "+error.message);}
 });
 stop.addEventListener("click",async()=>{
  try{render(await request("WEB_SLIM_AUDIT_STOP"));}
  catch(error){inform("Ошибка остановки: "+error.message);}
 });
 clear.addEventListener("click",async()=>{
  try{render(await request("WEB_SLIM_AUDIT_CLEAR"));}
  catch(error){inform("Ошибка очистки: "+error.message);}
 });
 download.addEventListener("click",async()=>{
  try{
   const snapshot=await request("WEB_SLIM_AUDIT_GET");
   if(snapshot.enabled)throw new Error("Останови запись перед выгрузкой.");
   const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"});
   const url=URL.createObjectURL(blob);
   try{
    const a=document.createElement("a");
    a.href=url;a.download="web-slim-network-report.json";
    document.body.append(a);a.click();a.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(url),3000);}
   render(snapshot);
  }catch(error){inform("Экспорт не удался: "+error.message);}
 });
 refresh.addEventListener("click",()=>loadTabs().catch(()=>inform("Не удалось получить список вкладок.")));
 chrome.tabs.onCreated.addListener(()=>{if(!report?.enabled)void loadTabs().catch(()=>{});});
 chrome.tabs.onRemoved.addListener(()=>{if(!report?.enabled)void loadTabs().catch(()=>{});});
 void getState();
 void loadTabs().catch(()=>inform("Не удалось прочитать вкладки браузера."));
}
