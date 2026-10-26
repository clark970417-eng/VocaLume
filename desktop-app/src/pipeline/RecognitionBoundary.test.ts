import {it,expect} from 'vitest'
import {RecognitionBoundary,restoreRecognizedOverlap} from './RecognitionBoundary'

const audio=new Float32Array(32000).fill(.1)
const prior={segment:'a',speechSeconds:2,speechEndSample:32000,captureStartSample:0,captureEndSample:32000,continuationExpected:true}
const next={segment:'b',speechSeconds:1,speechEndSample:16000,captureStartSample:32000,captureEndSample:48000}
it('reuses only existing audio at an exact forced cut, keeping one recognition request',()=>{
 const boundary=new RecognitionBoundary();boundary.remember(audio,16000,prior,'魚が逃げて','ja')
 const prepared=boundary.prepare(audio.slice(0,16000),16000,next,'ja')!
 expect(prepared.audio.length).toBe(16000+32000)
 expect(prepared.evidence.captureEndSample).toBe(next.captureEndSample)
 expect(prepared.evidence.captureStartSample).toBe(0)
 expect(prepared.restore('逃げてしまいました。')).toBe('魚が逃げてしまいました。')
 expect(boundary.prepare(audio,16000,{...next,captureStartSample:32001},'ja')).toBeNull()
 expect(boundary.prepare(audio,16000,next,'zh')).toBeNull()
 expect(boundary.prepare(audio,8000,next,'ja')).toBeNull()
 expect(boundary.prepare(audio,16000,{...next,segment:'a'},'ja')).toBeNull()
 expect(boundary.prepare(audio,16000,{...next,captureEndSample:64000},'ja')).toBeNull()
 boundary.clear();expect(boundary.prepare(audio,16000,next,'ja')).toBeNull()
})
it('does not reuse at natural pauses, on invalid capture metadata, or for other languages',()=>{
 const boundary=new RecognitionBoundary()
 for(const evidence of [undefined,{...prior,continuationExpected:false},{...prior,speechEndSample:28000},{...prior,captureEndSample:32001}]){
  boundary.remember(audio,16000,evidence,'魚が逃げて','ja')
  expect(boundary.prepare(audio,16000,next,'ja')).toBeNull()
 }
 boundary.remember(audio,16000,prior,'some English','en')
 expect(boundary.prepare(audio,16000,next,'en')).toBeNull()
 boundary.remember(audio,16000,prior,'まだ食べてないです。あとで','ja')
 expect(boundary.prepare(audio.slice(0,16000),16000,next,'ja')).toBeNull()
})
it('retains changed negation, tense, short overlaps and deliberate whole repetitions',()=>{
 expect(restoreRecognizedOverlap('まだ終わってい','終わっていません。')).toBe('まだ終わっていません。')
 expect(restoreRecognizedOverlap('他说今天不会。','今天不会来。')).toBe('他说今天不会来。')
 expect(restoreRecognizedOverlap('明天不能参加,下个新的节目。','不能参加下个星期可以')).toBe('明天不能参加,下个星期可以')
 expect(restoreRecognizedOverlap('あと3回ではなく2回だけちょうど','ではなく2回だけ挑戦します')).toBe('あと3回ではなく2回だけ挑戦します')
 expect(restoreRecognizedOverlap('まだ終わってい','終わりました。')).toBe('終わりました。')
 expect(restoreRecognizedOverlap('はい','はい、はい。')).toBe('はい、はい。')
 expect(restoreRecognizedOverlap('ありがとう','ありがとう。')).toBe('ありがとう。')
 expect(restoreRecognizedOverlap('三回だけ','二回だけです。')).toBe('二回だけです。')
})
