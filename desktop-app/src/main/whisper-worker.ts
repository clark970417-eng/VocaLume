import type { WhisperOptions } from '@kutalia/whisper-node-addon'
import { lowerInferencePriority, windowsInferenceThreads } from '../engines/inference-resources'

async function start(): Promise<void> {
  lowerInferencePriority()
  const { transcribe } = await import('@kutalia/whisper-node-addon')
  let queue: Promise<void> = Promise.resolve()
  process.parentPort!.on('message', (event: {data: {type:string;id:number;options:WhisperOptions}}) => {
    const message = event.data
    if (message.type !== 'transcribe') return
    queue = queue.then(async () => {
      try {
        const result = await transcribe({...message.options,n_threads:windowsInferenceThreads().whisper})
        process.parentPort!.postMessage({type:'result',id:message.id,result})
      } catch (error) {
        process.parentPort!.postMessage({type:'error',id:message.id,message:String(error)})
      }
    })
  })
  process.parentPort!.postMessage({type:'ready'})
}
void start().catch(error => process.parentPort!.postMessage({type:'fatal',message:String(error)}))
