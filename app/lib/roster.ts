import { isParticipantCount } from './workshop-limits';

export type RosterEntry = { name: string; email: string };

/** Keep organizer seats separate when importing a guest export that includes hosts. */
export function prepareRosterImport(entries:RosterEntry[],facilitatorEmails:readonly string[]){const reserved=new Set(facilitatorEmails.map(email=>email.trim().toLowerCase()));const participants=entries.filter(person=>!reserved.has(person.email.trim().toLowerCase()));return{entries:participants,skippedFacilitators:entries.length-participants.length};}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if(c==='\r' && text[i+1]==='\n')i++; row.push(field.trim()); if(row.some(Boolean))rows.push(row); row=[];field=''; }
    else field += c;
  }
  if (quoted) throw new Error('A quoted CSV field is not closed.');
  row.push(field.trim()); if(row.some(Boolean))rows.push(row); return rows;
}

function normalize(rows: string[][]): RosterEntry[] {
  if (!rows.length) throw new Error('The participant file is empty.');
  const header = rows[0].map(v=>v.trim().toLowerCase().replace(/[_\-]/g,' '));
  const nameIndex = header.findIndex(v=>['name','full name','participant name','guest name'].includes(v));
  const firstIndex=header.findIndex(v=>['first name','firstname','given name'].includes(v)),lastIndex=header.findIndex(v=>['last name','lastname','surname'].includes(v));
  const emailIndex = header.findIndex(v=>['email','email address','e mail','participant email'].includes(v));
  if((nameIndex<0&&firstIndex<0) || emailIndex<0) throw new Error('Use columns named Name and Email in the first row.');
  const entries=rows.slice(1).filter(r=>r.some(Boolean)).map((r,i)=>{
    const name=String(r[nameIndex]||[r[firstIndex],r[lastIndex]].filter(Boolean).join(' ')).trim(),email=String(r[emailIndex]||'').trim().toLowerCase();
    if(!name || name.length>100)throw new Error('Row '+(i+2)+': provide a name of 1–100 characters.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Row '+(i+2)+': invalid email address.');
    return {name,email};
  });
  if(!isParticipantCount(entries.length))throw new Error('Import 1 to 50 participants. This file contains '+entries.length+'.');
  if(new Set(entries.map(e=>e.email)).size!==entries.length)throw new Error('Each participant needs a unique email address.');
  return entries;
}

async function unzipXml(buffer: ArrayBuffer): Promise<Map<string,string>> {
  const bytes=new Uint8Array(buffer), view=new DataView(buffer); let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0)throw new Error('This is not a valid .xlsx workbook.');
  const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true);const result=new Map<string,string>();
  if(count>1000)throw new Error('Workbook is too complex. Export the participant sheet as CSV.');
  let total=0;
  for(let i=0;i<count;i++){
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw new Error('The workbook archive is damaged.');
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),expanded=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
    const name=new TextDecoder().decode(bytes.slice(offset+46,offset+46+nameLength));offset+=46+nameLength+extraLength+commentLength;
    if(!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(name))continue;
    total+=expanded;if(expanded>4_000_000||total>10_000_000)throw new Error('Workbook is too large. Export a simple CSV.');
    if(flags&1)throw new Error('Password-protected workbooks are not supported.');
    if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw new Error('Invalid workbook entry.');
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(start+size>bytes.length)throw new Error('Truncated workbook entry.');
    const data=bytes.slice(start,start+size);let raw:Uint8Array;
    if(method===0)raw=data;else if(method===8){
      if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot read Excel files. Please export as CSV.');
      const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));const reader=stream.getReader();const chunks:Uint8Array[]=[];let length=0;
      while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>4_000_000){await reader.cancel();throw new Error('Workbook entry exceeds size limit.');}chunks.push(value);}
      raw=new Uint8Array(length);let p=0;for(const chunk of chunks){raw.set(chunk,p);p+=chunk.length;}
    }else throw new Error('Unsupported workbook compression. Please export as CSV.');
    if(raw.length!==expanded)throw new Error('Workbook entry size does not match.');
    result.set(name,new TextDecoder().decode(raw));
  }return result;
}

function xml(text:string):Document{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Workbook XML is invalid.');return doc;}
function tags(root:Document|Element, name:string):Element[]{return Array.from(root.getElementsByTagNameNS('*',name));}
async function parseXlsx(file:File):Promise<string[][]>{
 const files=await unzipXml(await file.arrayBuffer()); const strings=files.has('xl/sharedStrings.xml')?tags(xml(files.get('xl/sharedStrings.xml')!),'si').map(si=>tags(si,'t').map(t=>t.textContent||'').join('')):[];
 let sheetName='xl/worksheets/sheet1.xml';
 if(files.has('xl/workbook.xml')&&files.has('xl/_rels/workbook.xml.rels')){
 const first=tags(xml(files.get('xl/workbook.xml')!),'sheet')[0];const id=first?.getAttribute('r:id'); const relation=tags(xml(files.get('xl/_rels/workbook.xml.rels')!),'Relationship').find(r=>r.getAttribute('Id')===id);const target=relation?.getAttribute('Target');if(target)sheetName=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');}
 const content=files.get(sheetName);if(!content)throw new Error('No first worksheet was found. Export as CSV.');
 return tags(xml(content),'row').map(row=>{const values:string[]=[];for(const c of tags(row,'c')){const ref=c.getAttribute('r')||'';const letters=ref.match(/^[A-Z]+/)?.[0]||'A';let col=0;for(const letter of letters)col=col*26+letter.charCodeAt(0)-64;if(col>1000)throw new Error('Too many worksheet columns.');const type=c.getAttribute('t');const value=tags(c,'v')[0]?.textContent||'';values[col-1]=type==='s'?strings[Number(value)]||'':type==='inlineStr'?tags(c,'t').map(t=>t.textContent||'').join(''):value;}return values;});
}

export async function parseRosterFile(file:File):Promise<RosterEntry[]>{
 if(file.size>3_000_000)throw new Error('Use a participant file smaller than 3 MB.');
 if(/\.csv$/i.test(file.name))return normalize(parseCsv(await file.text()));
 if(/\.xlsx$/i.test(file.name))return normalize(await parseXlsx(file));
 throw new Error('Choose a .csv or .xlsx file. Save older .xls workbooks as .xlsx first.');
}
