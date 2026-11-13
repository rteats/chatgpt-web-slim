"use strict";
document.querySelector("#launch").addEventListener("click",()=>{
 chrome.tabs.create({url:chrome.runtime.getURL("index.html")});
});
