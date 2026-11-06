const WebSocket=require('ws'),{createHash}=require('node:crypto')
const sha=value=>createHash('sha256').update(value).digest('base64')
exports.connectObs=({server_port,server_password})=>new Promise((resolve,reject)=>{
 const socket=new WebSocket('ws://127.0.0.1:'+server_port),pending=new Map();let sequence=0
 const startup=setTimeout(()=>{socket.close();reject(new Error('OBS WebSocket startup timed out'))},10000)
 socket.on('error',reject)
 socket.on('message',bytes=>{
  const message=JSON.parse(String(bytes))
  if(message.op===0){const auth=message.d.authentication;socket.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:0,...(auth?{authentication:sha(sha(server_password+auth.salt)+auth.challenge)}:{})}}))}
  if(message.op===2){clearTimeout(startup);resolve({
   call:(requestType,requestData={})=>new Promise((accept,fail)=>{
    const requestId=String(++sequence),timer=setTimeout(()=>{pending.delete(requestId);fail(new Error('OBS request timed out: '+requestType))},10000)
    pending.set(requestId,{accept,fail,timer});socket.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}))
   }),close:()=>socket.close()
  })}
  if(message.op===7){const job=pending.get(message.d.requestId);if(!job)return;clearTimeout(job.timer);pending.delete(message.d.requestId)
   message.d.requestStatus.result?job.accept(message.d.responseData||{}):job.fail(new Error(message.d.requestStatus.comment||'OBS request failed'))
  }
 })
 socket.on('close',()=>{clearTimeout(startup);for(const job of pending.values()){clearTimeout(job.timer);job.fail(new Error('OBS connection closed'))}})
})
