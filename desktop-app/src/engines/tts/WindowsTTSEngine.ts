import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { ALL_LANGUAGES, type Language, type TTSResult, type TtsVoiceOption } from '../types'
import { KokoroTTSEngine, TTS_VOICES } from './KokoroTTSEngine'

const SAMPLE_RATE = 24_000
const SYSTEM_VOICE = 'sapi:'
const VOICE_CACHE_MS = 60_000
const ENGLISH_VOICES = TTS_VOICES.en ?? []

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$request = ConvertFrom-Json ([Console]::In.ReadToEnd())
$speech = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  if ($request.action -eq 'voices') {
    $voices = @($speech.GetInstalledVoices() | Where-Object Enabled | ForEach-Object {
      @{ name = $_.VoiceInfo.Name; locale = $_.VoiceInfo.Culture.Name }
    })
    [Console]::Write((ConvertTo-Json -Compress -InputObject $voices))
  } else {
    $speech.SelectVoice([string]$request.voice)
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(24000, 'Sixteen', 'Mono')
    $audio = [IO.MemoryStream]::new()
    try {
      $speech.SetOutputToAudioStream($audio, $format)
      $speech.Speak([string]$request.text)
      $speech.SetOutputToNull()
      $bytes = $audio.ToArray()
      [Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)
    } finally { $audio.Dispose() }
  }
} finally { $speech.Dispose() }
`

const command = Buffer.from(SCRIPT, 'utf16le').toString('base64')

function runSapi(request: Record<string, string>, signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const shell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = execFile(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', command],
      { windowsHide: true, encoding: 'buffer', timeout: 6000, maxBuffer: 4 * 1024 * 1024, signal },
      (error, stdout) => {
        if (error) reject(signal?.aborted ? signal.reason : new Error('Windows speech synthesis failed.'))
        else resolve(stdout)
      })
    // Speech text and the voice name are data on stdin, never PowerShell code.
    child.stdin?.on('error', () => {})
    child.stdin?.end(JSON.stringify(request), 'utf8')
  })
}

function voiceLanguage(locale: string): Language | undefined {
  const normalized = locale.toLowerCase()
  if (normalized === 'zh-tw' || normalized === 'zh-hant-tw') return 'zh'
  const language = normalized.split('-')[0] as Language
  return language !== 'zh' && ALL_LANGUAGES.includes(language) ? language : undefined
}

type SystemVoice = { name: string; locale: string }
let voiceCache: { expires: number; result: Promise<TtsVoiceOption[]> } | undefined

async function systemVoices(): Promise<TtsVoiceOption[]> {
  if (voiceCache && Date.now() < voiceCache.expires) return voiceCache.result
  const result = runSapi({ action: 'voices' }).then(buffer => {
    const voices = JSON.parse(buffer.toString('utf8')) as SystemVoice[]
    return voices.flatMap(({ name, locale }) => {
      const language = voiceLanguage(locale)
      return language ? [{ id: SYSTEM_VOICE + name, label: name, language }] : []
    })
  })
  voiceCache = { expires: Date.now() + VOICE_CACHE_MS, result }
  return result
}

export async function getWindowsTtsVoices(): Promise<TtsVoiceOption[]> {
  const native = await systemVoices().catch(() => [])
  return [...ENGLISH_VOICES.map(voice => ({ ...voice, language: 'en' as const })), ...native]
}

export function selectWindowsTtsVoice(voices: readonly TtsVoiceOption[], language: Language, configured: string): TtsVoiceOption | undefined {
  const compatible = voices.filter(voice => voice.language === language)
  return compatible.find(voice => voice.id === configured) ?? compatible[0]
}

export class TtsVoiceUnavailableError extends Error {}

/** Uses installed Windows voices by locale, with Kokoro retained for English. */
export class WindowsTTSEngine {
  private voice = 'auto'
  private kokoro?: KokoroTTSEngine

  // Windows speech and Kokoro are both opened only for the first matching cue.
  async initialize(): Promise<void> {}
  setVoice(voice: string): void { this.voice = voice }

  async synthesize(text: string, language: Language, signal?: AbortSignal): Promise<TTSResult> {
    signal?.throwIfAborted()
    if (!text.trim()) return { audio: new Float32Array(0), sampleRate: SAMPLE_RATE }
    if (text.length > 1000) throw new Error('Speech text is too long.')
    const requested = this.voice
    const englishSystemVoice = language === 'en' && requested.startsWith(SYSTEM_VOICE)
      ? (await systemVoices().catch(() => [])).find(voice => voice.language === 'en' && voice.id === requested)
      : undefined
    signal?.throwIfAborted()
    if (language === 'en' && !englishSystemVoice) {
      const engine = this.kokoro ??= new KokoroTTSEngine()
      const voice = ENGLISH_VOICES.some(option => option.id === requested) ? requested : 'auto'
      engine.setVoice(voice)
      try {
        await engine.initialize()
      } catch (error) {
        this.kokoro = undefined
        await engine.dispose()
        throw error
      }
      return engine.synthesize(text, language, signal)
    }
    const voice = englishSystemVoice ?? selectWindowsTtsVoice(await systemVoices(), language, requested)
    signal?.throwIfAborted()
    if (!voice) throw new TtsVoiceUnavailableError('No Windows speech voice is installed for this translation language.')
    const pcm = await runSapi({ action: 'speak', voice: voice.label, text }, signal)
    signal?.throwIfAborted()
    if (!pcm.length || pcm.length % 2) throw new Error('Windows speech synthesis returned invalid audio.')
    const audio = new Float32Array(pcm.length / 2)
    for (let index = 0; index < audio.length; index++) audio[index] = pcm.readInt16LE(index * 2) / 32768
    return { audio, sampleRate: SAMPLE_RATE }
  }

  async dispose(): Promise<void> {
    const engine = this.kokoro
    this.kokoro = undefined
    await engine?.dispose()
  }
}
