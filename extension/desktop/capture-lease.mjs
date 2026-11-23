import {spawn} from 'node:child_process';

// A short-lived helper holds the kernel lock until the owner's stdin closes.
// The lock file can remain after a crash; only the open descriptor owns it.
export function claimMacCapture(helper,path){
 return new Promise((resolve,reject)=>{
  const child=spawn(helper,[path],{stdio:['pipe','pipe','ignore']});
  const timer=setTimeout(()=>{
   child.kill();
   reject(new Error('VocaLume capture lock did not respond'));
  },2000);
  child.stdin.on('error',()=>{}); // The helper may exit before a losing request can close stdin.
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',code=>{
   clearTimeout(timer);
   if(code===75)resolve(null);
   else reject(new Error('VocaLume capture lock could not be opened'));
  });
  child.stdout.once('data',chunk=>{
   clearTimeout(timer);
   if(chunk[0]!==49){child.kill();reject(new Error('Invalid VocaLume capture lock response'));return;}
   resolve(()=>child.stdin.end());
  });
 });
}
