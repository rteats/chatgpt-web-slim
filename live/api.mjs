/** User-triggered, read-only ChatGPT web requests. No credential capture or retries. */
const BASE="https://chatgpt.com",MIN_GAP_MS=3000,WINDOW_MS=600000,LIMIT=20;
export class ApiError extends Error{
 constructor(message,status=0){super(message);this.name="ApiError";this.status=status;}
}
function validID(value){return typeof value==="string"&&/^[a-zA-Z0-9_-]{8,128}$/.test(value);}
function retryDelay(header,now){
 if(!header)return 60000;
 const seconds=Number(header);
 if(Number.isFinite(seconds))return Math.max(1000,Math.min(86400000,seconds*1000));
 const t=Date.parse(header);
 return Number.isFinite(t)?Math.max(1000,Math.min(86400000,t-now)):60000;
}
export class ChatReader{
 constructor({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now(),
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onDiagnostic=()=>{}}={}){
  this.fetchImpl=fetchImpl;this.now=now;this.sleep=sleep;this.timestamps=[];
  this.queue=Promise.resolve();this.cache=new Map();this.inflight=new Map();
  this.lastRequestAt=-Infinity;this.blockedUntil=0;
  this.onDiagnostic=onDiagnostic;
 }
 clearCache(){this.cache.clear();}
 request(path,ttlMs=0){
  const cached=this.cache.get(path);
  if(cached&&cached.expiresAt>this.now()){
   this.#diag("cache_hit",{operation:this.#operation(path)});
   return Promise.resolve(cached.payload);
  }
  if(this.inflight.has(path)){
   this.#diag("request_joined",{operation:this.#operation(path)});
   return this.inflight.get(path);
  }
  const pending=this.queue.then(()=>this.#send(path,ttlMs),()=>this.#send(path,ttlMs));
  this.queue=pending.catch(()=>{});
  this.inflight.set(path,pending);
  pending.finally(()=>this.inflight.delete(path)).catch(()=>{});
  return pending;
 }
 #operation(path){
  if(path.startsWith("/backend-api/ps/plugins/"))return "plugins";
  if(path.startsWith("/backend-api/conversations/"))return "conversation";
  if(path.startsWith("/backend-api/conversations?"))return "conversations";
  return "unknown";
 }
 #diag(event,details){try{this.onDiagnostic(event,details);}catch{ /* Diagnostics must never break network flow. */ }}
 async #send(path,ttlMs){
  const operation=this.#operation(path),started=this.now();
  try{return await this.#sendActual(path,ttlMs,operation,started);}
  catch(error){
   const status=Number(error?.status)||0;
   const errorClass=[401,403].includes(status)?"authentication":
    [429,503].includes(status)?"rate_limited":status>=500?"server":
    status>=400?"validation":error?.message?.startsWith("Ошибка сети")?"network":"format";
   this.#diag("request_failed",{operation,status,errorClass,durationMs:this.now()-started});
   throw error;
  }
 }
 async #sendActual(path,ttlMs,operation,started){
  if(this.now()<this.blockedUntil)throw new ApiError("Сервер ограничил запросы",429);
  const gap=Math.max(0,this.lastRequestAt+MIN_GAP_MS-this.now());
  if(gap)await this.sleep(gap);
  const t=this.now();
  this.timestamps=this.timestamps.filter(x=>t-x<WINDOW_MS);
  if(this.timestamps.length>=LIMIT)throw new ApiError("Локальный лимит: 20 запросов за 10 минут. Запрос не отправлен.",429);
  this.timestamps.push(t);this.lastRequestAt=t;
  this.#diag("request_started",{operation});
  let response;
  try{
   response=await this.fetchImpl(BASE+path,{method:"GET",credentials:"include",mode:"cors",
    redirect:"error",headers:{Accept:"application/json"},cache:"no-store"});
  }catch{
   throw new ApiError("Ошибка сети, CORS или сессии. Проверьте вход в ChatGPT.");
  }
  if([401,403].includes(response.status))throw new ApiError("Авторизация отклонена ("+response.status+"). Не вставляйте cookies вручную.",response.status);
  if([429,503].includes(response.status)){
   this.blockedUntil=this.now()+retryDelay(response.headers.get("retry-after"),this.now());
   throw new ApiError("Сервер ответил "+response.status+". Автоповторов нет.",response.status);
  }
  if(!response.ok)throw new ApiError("HTTP "+response.status);
  if(!(response.headers.get("content-type")||"").toLowerCase().includes("json"))
   throw new ApiError("Получен ответ не в формате JSON.");
  let payload;
  try{payload=await response.json();}catch{throw new ApiError("Ошибка разбора JSON.");}
  if(ttlMs)this.cache.set(path,{payload,expiresAt:this.now()+ttlMs});
  this.#diag("request_succeeded",{operation,status:response.status,durationMs:this.now()-started});
  return payload;
 }
 list(offset=0){
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new ApiError("Неверный offset");
  const q=new URLSearchParams({exclude_conversation_origin:"tpp",expand:"false",
   hide_snorlax:"false",is_archived:"false",is_starred:"false",limit:"20",
   order:"updated",offset:String(offset)});
  return this.request("/backend-api/conversations?"+q.toString(),20000);
 }
 conversation(id,before=null){
  if(!validID(id))throw new ApiError("Неверный ID диалога");
  const q=new URLSearchParams({num_turns:"10",include_has_versions:"true"});
  if(before!==null){
   if(typeof before!=="string"||!before||before.length>1024)throw new ApiError("Неверный cursor");
   q.set("before",before);
  }
  return this.request("/backend-api/conversations/"+encodeURIComponent(id)+"?"+q.toString(),60000);
 }
 plugins(){return this.request("/backend-api/ps/plugins/installed",60000);}
}
