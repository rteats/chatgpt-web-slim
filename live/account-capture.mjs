// Read one harmless workspace-routing header from first-party ChatGPT traffic only.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function readFirstPartyAccountHeader(details){
 if(details?.initiator!=="https://chatgpt.com")return null;
 let url;
 try{url=new URL(details.url);}catch{return null;}
 if(url.origin!=="https://chatgpt.com")return null;
 const allowed=url.pathname==="/backend-api/wham/accounts/check" ||
  url.pathname==="/backend-api/conversations" ||
  url.pathname.startsWith("/backend-api/conversations/");
 if(!allowed)return null;
 const matched=details.requestHeaders?.find(x=>typeof x?.name==="string"&&x.name.toLowerCase()==="chatgpt-account-id");
 const value=matched?.value;
 return typeof value==="string"&&UUID.test(value)?value:null;
}
