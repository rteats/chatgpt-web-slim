import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeExport,asText,getMessages,listMetadata} from './model.mjs';

test('normalizes and sorts exported conversations',()=>{
 const data=normalizeExport([{id:'a',title:'Old',update_time:1},{id:'b',title:'New',update_time:2}]);
 assert.deepEqual(listMetadata(data).map(x=>x.id),['b','a']);
});
test('uses selected branch rather than abandoned alternatives',()=>{
 const mapping={
  root:{id:'root',parent:null,message:null},
  u:{id:'u',parent:'root',message:{id:'1',author:{role:'user'},content:{parts:['Hi']}}},
  a:{id:'a',parent:'u',message:{id:'2',author:{role:'assistant'},content:{parts:['Selected']}}},
  b:{id:'b',parent:'u',message:{id:'3',author:{role:'assistant'},content:{parts:['Ignored']}}}
 };
 const [conversation]=normalizeExport([{id:'c',mapping,current_node:'a'}]);
 assert.deepEqual(getMessages(conversation).map(x=>x.text),['Hi','Selected']);
});
test('renders non-text placeholders',()=>{
 assert.match(asText({content:{parts:['Text',{content_type:'image_asset_pointer',asset_pointer:'x'}]}}),/Image attachment/);
});
test('CSP prevents remote connections and worker makes no network calls',()=>{
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const worker=fs.readFileSync(new URL('./worker.mjs',import.meta.url),'utf8');
 assert.match(html,/connect-src 'none'/);
 assert.doesNotMatch(worker,/fetch\s*\(|XMLHttpRequest|indexedDB|localStorage/);
});
