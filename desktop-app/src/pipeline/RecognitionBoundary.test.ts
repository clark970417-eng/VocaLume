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
it('allows a brief voiced continuation with a VAD quiet tail and keeps only proven speech duration', () => {
  const boundary = new RecognitionBoundary()
  const previous = new Float32Array(64000).fill(0.1)
  boundary.remember(previous, 16000, {
    ...prior, captureEndSample: 64000, speechEndSample: 64000, speechSeconds: 2.4
  }, 'まだ終わってい', 'ja')
  const continuation = new Float32Array(32000)
  continuation.fill(0.1, 0, 6400)
  const evidence = {
    ...next, captureStartSample: 64000, captureEndSample: 96000, speechEndSample: 6400, speechSeconds: 0.4
  }
  const prepared = boundary.prepare(continuation, 16000, evidence, 'ja')!
  expect(prepared.audio).toHaveLength(64000)
  expect(prepared.evidence.speechSeconds).toBeCloseTo(0.8)
  expect(prepared.restore('終わっていません。')).toBe('まだ終わっていません。')
  expect(boundary.prepare(continuation, 16000, { ...evidence, speechEndSample: 16001 }, 'ja')).toBeNull()
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
