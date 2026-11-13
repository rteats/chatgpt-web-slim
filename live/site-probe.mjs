/**
 * One user-triggered diagnostic GET from a regular chatgpt.com tab.
 * Runs as an isolated content script. Returns only safe aggregate metadata.
 * No response body, conversation IDs, names, headers or tokens are exported.
 */
export async function runSiteProbe(accountId,path){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(typeof accountId!=="string"||!uuid.test(accountId)||
    typeof path!=="string"||!path.startsWith("/backend-api/conversations?")||
    location.origin!=="https://chatgpt.com"){
  return {kind:"validation"};
 }
 try{
  const response=await fetch(location.origin+path,{
   method:"GET",credentials:"include",cache:"no-store",
   headers:{Accept:"application/json","ChatGPT-Account-ID":accountId}
  });
  const contentType=(response.headers.get("content-type")||"").toLowerCase();
  const responseType=contentType.includes("json")?"json":
   contentType.includes("html")?"html":contentType.startsWith("text/")?"text":"other";
  const output={status:response.status,responseType};
  if(response.ok&&responseType==="json"){
   try{
    const payload=await response.json();
    output.itemsShape=Array.isArray(payload?.items)?"array":"other";
    if(Array.isArray(payload?.items))output.count=payload.items.length;
    if(typeof payload?.total==="number"&&Number.isSafeInteger(payload.total)&&payload.total>=0)
     output.total=payload.total;
   }catch{output.kind="format";}
  }
  return output;
 }catch{return {kind:"network"};}
}
