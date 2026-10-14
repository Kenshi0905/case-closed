// Dependency-free publication guard. Complements, but does not replace, secret scanning.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const failures=[];
for(const file of files){
 if(/(?:^|\/)(?:node_modules|\.local-ai|\.wrangler|\.sites-runtime|\.next|dist|coverage)(?:\/|$)/.test(file)||/(?:^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?!\.example$)(?:\..*)?|relay\.secrets|relay-status\.json)$/.test(file)||/\.(?:gguf|db|sqlite|sqlite3|pem|key|log)$/i.test(file))failures.push(file+': private/runtime file');
 if(statSync(file).size>40*1024*1024)failures.push(file+': unexpectedly large publication');
 if(!/\.(?:png|gif|jpg|jpeg|webp|ico|docx|pdf|woff2?)$/i.test(file)){
  let text=readFileSync(file,'utf8');
  // This exact rejected loopback URL is an intentional credential-validation fixture.
  if(file==='tests/local-ai-relay.test.mjs')text=text.replaceAll(['http://user:password','localhost:8081'].join('@'),'http://localhost:8081');
  for(const [kind,pattern] of [
   ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
   ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
   ['provider key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
   ['credential URL',/https?:\/\/[^\s/@:'"<>]+:[^\s/@'"<>]+@[^\s/'"<>]+/],
  ])if(pattern.test(text))failures.push(file+': '+kind);
 }
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Publication guard passed for ${files.length} tracked files. Run a full secret scanner before initial publication.`);
