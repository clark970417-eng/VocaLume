import { lowerInferencePriority } from '../engines/inference-resources'
import { isAcousticLaughter } from '../engines/diarization/audio-classification'

type AudioWindow = { samples: Float32Array; sampleRate: number }
type SpeakerStream = { acceptWaveform(audio: AudioWindow): void; inputFinished(): void }
type TagStream = { acceptWaveform(audio: AudioWindow): void }
type NativeConfig = { model: string; numThreads: number; provider: string }
type Sherpa = {
  SpeakerEmbeddingExtractor: new (config: NativeConfig) => {
    createStream(): SpeakerStream
    isReady(stream: SpeakerStream): boolean
    compute(stream: SpeakerStream, external: boolean): Float32Array
  }
  AudioTagging: new (config: {
    model: Omit<NativeConfig, 'model'> & { ced: string }
    labels: string
    topK: number
  }) => { createStream(): TagStream; compute(stream: TagStream): { name: string; prob: number }[] }
}

type WorkerMessage = {
  type: string
  id: number
  mode?: 'speaker' | 'laughter'
  model?: string
  labels?: string
  options?: AudioWindow
}

const parent = process.parentPort!
let analyze: ((audio: AudioWindow) => Float32Array | boolean | null) | undefined
lowerInferencePriority()
parent.on('message', async ({ data }: { data: WorkerMessage }) => {
  try {
    if (data.type === 'init') {
      if (!data.model) throw new Error('Missing acoustic model')
      const sherpa = (await import('sherpa-onnx-node')).default as Sherpa
      const threads = { numThreads: 1, provider: 'cpu' }
      if (data.mode === 'speaker') {
        const extractor = new sherpa.SpeakerEmbeddingExtractor({ ...threads, model: data.model })
        analyze = audio => {
          const stream = extractor.createStream()
          stream.acceptWaveform(audio)
          stream.inputFinished()
          return extractor.isReady(stream) ? extractor.compute(stream, false) : null
        }
      } else if (data.mode === 'laughter' && data.labels) {
        const tagger = new sherpa.AudioTagging({ model: { ...threads, ced: data.model }, labels: data.labels, topK: 3 })
        analyze = audio => {
          const stream = tagger.createStream()
          stream.acceptWaveform(audio)
          return isAcousticLaughter(tagger.compute(stream))
        }
      } else throw new Error('Missing acoustic classifier configuration')
      parent.postMessage({ type: 'ready' })
    } else if (data.type === 'transcribe' && data.options) {
      if (!analyze) throw new Error('Acoustic model is not ready')
      parent.postMessage({ type: 'result', id: data.id, result: analyze(data.options) })
    }
  } catch (error) {
    parent.postMessage({ type: data.type === 'init' ? 'fatal' : 'error', id: data.id, message: String(error) })
  }
})
