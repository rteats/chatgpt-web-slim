import {readFirstPartyAccountHeader} from "./account-capture.mjs";

// Observe only the first-party account selector. Never read cookies, auth tokens,
// request bodies or message content. No request is modified or blocked.
chrome.webRequest.onBeforeSendHeaders.addListener(details=>{
 const accountId=readFirstPartyAccountHeader(details);
 if(!accountId)return;
 chrome.storage.session.set({capturedAccountId:accountId}).catch(()=>{});
},{
 urls:[
  "https://chatgpt.com/backend-api/conversations*",
  "https://chatgpt.com/backend-api/wham/accounts/check"
 ]
},["requestHeaders"]);

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return false;
 if(message?.type==="WEB_SLIM_GET_ACCOUNT"){
  chrome.storage.session.get("capturedAccountId").then(data=>{
   sendResponse({accountId:data.capturedAccountId??null});
  }).catch(()=>sendResponse({accountId:null}));
  return true;
 }
 if(message?.type==="WEB_SLIM_CLEAR_ACCOUNT"){
  chrome.storage.session.remove("capturedAccountId")
   .then(()=>sendResponse({ok:true}))
   .catch(()=>sendResponse({ok:false}));
  return true;
 }
 return false;
});
