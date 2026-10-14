import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile(new URL('../app/lib/opening-dialogue.ts',import.meta.url),'utf8');
const javascript = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {getOpeningBeats,openingHotkeyAllowed}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
const panel=(id,caption='The complete server caption stays intact. It includes 21:17 and 21:19.')=>({id,title:'A scene',caption,flavor:'Atmosphere',choices:[]});

test('the opening introduces the anonymous player and the doctor without casting a named suspect',()=>{
 const beats=getOpeningBeats(panel('threshold'));
 assert.deepEqual(beats.map(b=>b.speaker),['you','doctor']);
 assert.equal(beats[0].text,panel('threshold').caption);
 assert.match(beats[1].text,/Come in./);
 assert.match(beats[1].text,/report on the bench/);
 assert.doesNotMatch(beats.map(b=>b.text).join(' '),/Mira|Dev Mehta|Isha|Kabir|Tara|Neil/);
});
test('every selected conversation preserves its entire authoritative outcome as the final narration',()=>{
 const choices={threshold:['routine','hesitation','resolve'],preparation:['order','unfinished','distance'],interruption:['reputation','work','belonging'],trace:['detail','silence','doubt'],corridor:['echo','light','stillness'],departure:['uncertainty','weight','questions']};
 for(const [id,options] of Object.entries(choices))for(const choice of options){
  const p=panel(id);const beats=getOpeningBeats(p,choice);
  assert.deepEqual(beats.at(-1),{speaker:'narration',text:p.caption});
  if(id==='threshold'||id==='preparation')assert.deepEqual(beats.map(b=>b.speaker),['you','doctor','narration']);
 }
});
test('Dr. Sen never speaks after the collapse and later scenes contain narration only',()=>{
 for(const id of ['trace','corridor','departure'])for(const choice of [undefined,'detail','silence','doubt','echo','light','stillness','uncertainty','weight','questions']){
  const p=panel(id);assert.deepEqual(getOpeningBeats(p,choice),[{speaker:'narration',text:p.caption}]);
 }
 assert.equal(getOpeningBeats(panel('interruption'),'reputation').some(b=>b.speaker==='doctor'),false);
});
test('unknown choices still show the exact server outcome without inventing a reply',()=>{
 const p=panel('preparation');assert.deepEqual(getOpeningBeats(p,'new-choice'),[{speaker:'narration',text:p.caption}]);
});

test('new incident narration follows the animation without replaying pre-shot speech, while legacy beats remain',()=>{
 const p=panel('interruption','I fire once. Dr. Sen falls beside the bench at 21:17.');
 assert.deepEqual(getOpeningBeats(p,'work',3),[{speaker:'narration',text:p.caption}]);
 assert.equal(getOpeningBeats(p,'work',2)[0].speaker,'you');
});
const clean={defaultPrevented:false,repeat:false,altKey:false,ctrlKey:false,metaKey:false};
const body={closest:()=>null};
const within={closest:()=>null};
const outside={closest:()=>null};
const root={contains:node=>node===within};
test('opening hotkeys work on the scene/body but do not steal focus from external menu controls',()=>{
 assert.equal(openingHotkeyAllowed(clean,body,root,body),true);
 assert.equal(openingHotkeyAllowed(clean,within,root,body),true);
 assert.equal(openingHotkeyAllowed(clean,outside,root,body),false);
 const input={closest:()=>({})};assert.equal(openingHotkeyAllowed(clean,input,{contains:()=>true},body),false);
});
test('text reveal, modifier keys and held keys cannot also advance the opening',()=>{
 for(const flag of ['defaultPrevented','repeat','altKey','ctrlKey','metaKey'])assert.equal(openingHotkeyAllowed({...clean,[flag]:true},within,root,body),false);
});
