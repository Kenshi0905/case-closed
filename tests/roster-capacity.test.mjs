import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const base=new URL('../app/lib/',import.meta.url);
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const limitsURL=url(await fs.readFile(new URL('workshop-limits.ts',base),'utf8'));
const roster=await import(url((await fs.readFile(new URL('roster.ts',base),'utf8')).replace("'./workshop-limits'",JSON.stringify(limitsURL))));
const csv=count=>new File(['Name,Email\n'+Array.from({length:count},(_,i)=>'Person '+i+',p'+i+'@example.test').join('\n')],'roster.csv');
test('CSV import accepts small workshops through the maximum without padding the roster',async()=>{
 for(const count of [1,5,6,10,15,50]){const people=await roster.parseRosterFile(csv(count));assert.equal(people.length,count);assert.equal(new Set(people.map(p=>p.email)).size,count);}
});
test('CSV import rejects an empty or oversized roster and keeps duplicate/email validation',async()=>{
 for(const count of [0,51])await assert.rejects(()=>roster.parseRosterFile(csv(count)),/1 to 50/);
 await assert.rejects(()=>roster.parseRosterFile(new File(['Name,Email\nFirst,person@example.test\nSecond,PERSON@example.test'],'duplicate.csv')),/unique email/);
 await assert.rejects(()=>roster.parseRosterFile(new File(['Name,Email\nFirst,invalid'],'invalid.csv')),/invalid email/);
});

test('actual event export columns are ignored except name and email',async()=>{const people=await roster.parseRosterFile(new File(['\uFEFFguest_id,name,first_name,last_name,email,phone_number,approval_status\n1,"Attendee, One",Attendee,One,PERSON@EXAMPLE.TEST,not imported,approved'],'guests.csv'));assert.deepEqual(people,[{name:'Attendee, One',email:'person@example.test'}]);});
test('blank full name falls back to first and last names',async()=>{const people=await roster.parseRosterFile(new File(['name,first_name,last_name,email\n,First,Last,person@example.test'],'guests.csv'));assert.deepEqual(people,[{name:'First Last',email:'person@example.test'}]);});

test('import preview excludes organizer rows while retaining normal participants',()=>{const reserved=['host@example.test'];const rows=[{name:'Host',email:'HOST@example.test'},{name:'Participant',email:'student@example.test'}];assert.deepEqual(roster.prepareRosterImport(rows,reserved),{entries:[rows[1]],skippedFacilitators:1});assert.equal(rows.length,2);});
