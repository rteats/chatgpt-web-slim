const worker=new Worker('./worker.mjs',{type:'module'});
const pending=new Map();
let seq=0;
const ask=(type,extra={})=>new Promise((resolve,reject)=>{
 const requestId=++seq;
 pending.set(requestId,{resolve,reject});
 worker.postMessage({type,requestId,...extra});
});
worker.addEventListener('message',({data})=>{
 const wait=pending.get(data.requestId);
 if(!wait)return;
 pending.delete(data.requestId);
 if(data.ok)wait.resolve(data);
 else wait.reject(new Error(data.error));
});
const fileInput=document.querySelector('#file');
const searchInput=document.querySelector('#search');
const conversationList=document.querySelector('#conversation-list');
const messageList=document.querySelector('#messages');
const titleEl=document.querySelector('#chat-title');
const loadEarlier=document.querySelector('#earlier');
const statusEl=document.querySelector('#status');
const messageCount=document.querySelector('#message-count');
let summaries=[],openConversation=null,shownFrom=0,wantedId=null;
const PAGE_SIZE=30;
function setStatus(message,bad=false){
 statusEl.textContent=message;
 statusEl.classList.toggle('error',bad);
}
worker.addEventListener('error',()=>setStatus('Worker failed; reload and try again.',true));
function clearMessages(note){
 messageList.replaceChildren();
 titleEl.textContent=note;
 messageCount.textContent='';
 loadEarlier.hidden=true;
}
function makeConversationButton(entry){
 const button=document.createElement('button');
 button.className='chat-item';
 button.type='button';
 button.textContent=entry.title;
 button.title=new Date(entry.updatedAt*1000).toLocaleString();
 button.dataset.id=entry.id;
 button.addEventListener('click',()=>chooseChat(entry.id));
 return button;
}
function highlightActive(id){
 for(const btn of conversationList.children)
  btn.classList.toggle('active',btn.dataset.id===id);
}
function showList(){
 const q=searchInput.value.trim().toLocaleLowerCase();
 const matching=summaries.filter(x=>x.title.toLocaleLowerCase().includes(q));
 const frag=document.createDocumentFragment();
 for(const item of matching.slice(0,1000))frag.appendChild(makeConversationButton(item));
 conversationList.replaceChildren(frag);
 setStatus(String(matching.length)+' conversations'+(matching.length>1000?' (first 1000 shown)':'')+' · all local');
 if(openConversation)highlightActive(openConversation.id);
}
function makeMessage(message){
 const article=document.createElement('article');
 article.className='message '+message.role;
 const label=document.createElement('div');
 label.className='message-role';
 label.textContent=message.role==='user'?'You':'Assistant';
 const content=document.createElement('div');
 content.className='message-body';
 content.textContent=message.text; // Untrusted exported content is never interpreted as HTML.
 article.append(label,content);
 return article;
}
function displayBatch(messages,from){
 const frag=document.createDocumentFragment();
 for(let i=from;i<messages.length;i++)frag.appendChild(makeMessage(messages[i]));
 messageList.replaceChildren(frag);
 loadEarlier.hidden=from===0;
 messageCount.textContent='Showing '+String(messages.length-from)+' of '+String(messages.length)+' messages';
 requestAnimationFrame(()=>{messageList.scrollTop=messageList.scrollHeight;});
}
async function openChat(id){
 titleEl.textContent='Loading…';
 try{
  const reply=await ask('conversation',{id});
  if(id!==wantedId)return;
  openConversation=reply;
  titleEl.textContent=reply.title;
  highlightActive(reply.id);
  shownFrom=Math.max(0,reply.messages.length-PAGE_SIZE);
  displayBatch(reply.messages,shownFrom);
 }catch(e){if(id===wantedId)setStatus(e.message,true);}
}
async function chooseChat(id){
 wantedId=id;
 await openChat(id);
}
loadEarlier.addEventListener('click',()=>{
 if(!openConversation||!shownFrom)return;
 const end=shownFrom;
 shownFrom=Math.max(0,end-PAGE_SIZE);
 const frag=document.createDocumentFragment();
 for(let i=shownFrom;i<end;i++)frag.appendChild(makeMessage(openConversation.messages[i]));
 const before=messageList.scrollHeight;
 messageList.prepend(frag);
 messageList.scrollTop+=messageList.scrollHeight-before;
 loadEarlier.hidden=shownFrom===0;
 messageCount.textContent='Showing '+String(openConversation.messages.length-shownFrom)+' of '+String(openConversation.messages.length)+' messages';
});
fileInput.addEventListener('change',async()=>{
 const file=fileInput.files?.[0];
 if(!file)return;
 setStatus('Reading export in a background worker…');
 try{
  const reply=await ask('load',{file});
  summaries=reply.items;
  openConversation=null;
  wantedId=null;
  clearMessages('Select a conversation');
  showList();
  if(summaries.length)await chooseChat(summaries[0].id);
 }catch(e){setStatus(e.message,true);}
});
searchInput.addEventListener('input',showList);
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
  e.preventDefault();searchInput.focus();searchInput.select();
 }
});
clearMessages('Import your ChatGPT export to begin');
