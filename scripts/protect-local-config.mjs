import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const target=path.resolve('.local-ai/relay.secrets');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write('Ready for private configuration on stdin (input is hidden).\n');
let input='';
process.stdin.setEncoding('utf8');process.stdin.on('data',async chunk=>{input+=chunk;if(!/[\r\n]/.test(input))return;process.stdin.pause();try{
 const config=JSON.parse(input.trim());if(!config.siteUrl||!config.relayToken)throw new Error('Invalid relay configuration');
 const script='Add-Type -AssemblyName System.Security; $ErrorActionPreference = "Stop"; $v=[Console]::In.ReadToEnd(); $b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($b))';
 const cipher=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify(config),encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
 if(!/^[A-Za-z0-9+/=]+$/.test(cipher))throw new Error('Encryption failed');
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,cipher+'\n');
 process.stdout.write('Private relay credentials saved with Windows user encryption.\n');process.exit(0);
}catch(error){process.stderr.write('Could not encrypt relay configuration: '+(error.stderr?.toString()||error.message)+'\n');process.exit(1);}});
