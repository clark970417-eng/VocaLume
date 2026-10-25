import {it, expect} from 'vitest'
import {RecognitionCheckpoint} from './RecognitionCheckpoint'
import {speechEvidenceFor} from '../engines/stt/transcript-guard'
import type {STTResult} from '../engines/types'

const result: STTResult = {text:'今日は行きません。',language:'ja',isFinal:true,timestamp:1}
const evidence = {segment:'1:1',speechSeconds:1,speechEndSample:16000}
const audio = new Float32Array(24000);audio.fill(.1,0,16000)

it('reuses only an identical voiced prefix followed by verified quiet audio in the same cue',()=>{
 const cache=new RecognitionCheckpoint();cache.remember(audio,16000,evidence,result)
 const final=new Float32Array(32000);final.set(audio)
 expect(cache.reuse(final,16000,evidence)?.text).toBe(result.text)
 expect(cache.reuse(final,16000,{...evidence,segment:'1:2'})).toBeNull()
 expect(cache.reuse(final,16000,{...evidence,speechEndSample:25000})).toBeNull()
 expect(cache.reuse(final,16000,{...evidence,speechSeconds:1.1})).toBeNull()
 expect(cache.reuse(final,16000)).toBeNull()
 final[25000]=1
 expect(cache.reuse(final,16000,evidence)).toBeNull()
 final[25000]=0;final[100]=.2
 expect(cache.reuse(final,16000,evidence)).toBeNull()
 final[100]=audio[100]!
 cache.clear();expect(cache.reuse(final,16000,evidence)).toBeNull()
})

it('never retains unfinished audio, empty results, or audio supplied without capture evidence',()=>{
 const cache=new RecognitionCheckpoint()
 cache.remember(audio.slice(0,17000),16000,evidence,result)
 expect(cache.reuse(audio,16000,evidence)).toBeNull()
 cache.remember(audio,16000,undefined,result)
 expect(cache.reuse(audio,16000,evidence)).toBeNull()
 cache.remember(audio,16000,evidence,{...result,text:''})
 expect(cache.reuse(audio,16000,evidence)).toBeNull()
})

it('accepts bounded capture evidence and ignores invalid or missing window metadata',()=>{
 expect(speechEvidenceFor(1,1.5,{segment:'1:1',speechEndSample:16000})).toEqual(evidence)
 for(const speechEndSample of [NaN,-1,0,24001,1.5])expect(speechEvidenceFor(1,1.5,{segment:'1:1',speechEndSample})).toEqual({speechSeconds:1})
 expect(speechEvidenceFor(2,1.5,{segment:'1:1',speechEndSample:16000})).toBeUndefined()
})

it('reuses an exact repeated speech window without requiring more quiet audio',()=>{
 const cache=new RecognitionCheckpoint(), speech=audio.slice(0,16000)
 cache.remember(speech,16000,evidence,result,'ja:terms1')
 expect(cache.reuse(speech.slice(),16000,evidence,'ja:terms1')?.text).toBe(result.text)
 expect(cache.reuse(speech,16000,evidence,'ja:terms2')).toBeNull()
 expect(cache.reuse(speech,16000,{...evidence,captureStartSample:512},'ja:terms1')).toBeNull()
 // One unfinished hypothesis cannot substitute for a final decode.
 expect(cache.reuse(audio,16000,evidence,'ja:terms1')).toBeNull()
})

it('reuses two agreeing speech hypotheses only after verified quiet and unchanged evidence',()=>{
 const cache=new RecognitionCheckpoint(), speech=audio.slice(0,16000)
 cache.remember(speech,16000,evidence,result)
 const moreSpeech=speech.slice();moreSpeech[500]=.2
 cache.remember(moreSpeech,16000,evidence,result)
 const padded=new Float32Array(24000);padded.set(moreSpeech)
 // An edited prefix is not a second hypothesis on the same captured speech.
 expect(cache.reuse(padded,16000,evidence)).toBeNull()
 cache.remember(moreSpeech,16000,evidence,result)
 expect(cache.reuse(padded,16000,evidence)?.text).toBe(result.text)
 expect(cache.reuse(padded.slice(0,18000),16000,evidence)).toBeNull()
 padded.fill(.02,18000,18512)
 expect(cache.reuse(padded,16000,evidence)).toBeNull()
 padded.fill(0,18000,18512)
 expect(cache.reuse(padded,16000,{...evidence,speechEndSample:18512})).toBeNull()
 expect(cache.reuse(padded,16000,{...evidence,speechSeconds:1.032})).toBeNull()
})
