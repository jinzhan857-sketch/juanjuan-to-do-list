'use strict';
// Observation only: no database writes or replacement import handlers.
const inspectionHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
let inspectionBusy=false;
setInterval(async()=>{
 if(!DB._db||inspectionBusy)return;inspectionBusy=true;
 try{
  const disk=await DB.snapshot([...DATA_STORES,'kv']);
  const memory=Object.fromEntries([...DATA_STORES,...DATA_KV].map(key=>[key,Array.isArray(S[key])?JSON.parse(recordFingerprint(S[key])):S[key]]));
  const count=store=>disk[store].length;
  document.querySelector('#storage-inspector-result').textContent=JSON.stringify({tasks:count('tasks'),todos:count('todos'),chats:count('chats'),messages:count('messages'),memories:count('memories'),operations:count('operations'),images:disk.tasks.reduce((n,t)=>n+(t.images||[]).length,0),growth:S.pet?.growth,points:S.dayStats,diskHash:await inspectionHash(disk),memoryHash:await inspectionHash(memory)},null,1);
 }catch(error){document.querySelector('#storage-inspector-result').textContent=error.message;}
 finally{inspectionBusy=false;}
},500);
