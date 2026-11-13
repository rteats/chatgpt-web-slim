import test from "node:test";
import assert from "node:assert/strict";
import {readFirstPartyAccountHeader} from "./account-capture.mjs";
const id="11111111-2222-4333-8444-555555555555";
const headers=[
 {name:"Authorization",value:"PRIVATE-TOKEN"},
 {name:"Cookie",value:"private-cookie"},
 {name:"ChatGPT-Account-ID",value:id}
];
const sample=(extras={})=>({
 initiator:"https://chatgpt.com",
 url:"https://chatgpt.com/backend-api/conversations?limit=20",
 requestHeaders:headers,...extras
});
test("captures only account selector from first-party requests",()=>{
 assert.equal(readFirstPartyAccountHeader(sample()),id);
 assert.equal(readFirstPartyAccountHeader(sample({url:"https://chatgpt.com/backend-api/wham/accounts/check"})),id);
});
test("rejects foreign initiators, irrelevant URLs and missing headers",()=>{
 assert.equal(readFirstPartyAccountHeader(sample({initiator:"chrome-extension://abcd"})),null);
 assert.equal(readFirstPartyAccountHeader(sample({initiator:"https://malicious.example"})),null);
 assert.equal(readFirstPartyAccountHeader(sample({url:"https://example.com/backend-api/conversations"})),null);
 assert.equal(readFirstPartyAccountHeader(sample({url:"https://chatgpt.com/api/auth/session"})),null);
 assert.equal(readFirstPartyAccountHeader(sample({requestHeaders:headers.slice(0,2)})),null);
});
test("rejects malformed account IDs",()=>{
 assert.equal(readFirstPartyAccountHeader(sample({requestHeaders:[{name:"ChatGPT-Account-ID",value:"invalid"}]})),null);
});
