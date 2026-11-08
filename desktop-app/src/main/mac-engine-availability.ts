import { accessSync, constants } from 'node:fs'
import type { MacEngineAvailability } from '../engine-selection'
import { findFluidAudioBinary } from '../engines/diarization/FluidAudioDiarizer'
import { findAppleSttBinary } from '../engines/stt/AppleSpeechTranscriberEngine'
import { haasPaths, isHaasAvailable } from '../engines/stt/HaasJaEngine'
import { findSpeechSwiftBinary } from '../engines/stt/Qwen3ASREngine'
import { findAppleTranslateBinary } from '../engines/translator/AppleTranslator'

function isExecutable(path: string | null): boolean {
  if (!path) return false
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function supportsMac26Helpers(): boolean {
  return process.platform === 'darwin' && parseInt(process.getSystemVersion?.() ?? '', 10) >= 26
}

export function isMacAppleSpeechAvailable(): boolean {
  return supportsMac26Helpers() && isExecutable(findAppleSttBinary())
}

export function isMacSpeakerIdentificationAvailable(): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64' && isExecutable(findFluidAudioBinary())
}

export async function getMacEngineAvailability(): Promise<MacEngineAvailability | null> {
  if (process.platform !== 'darwin') return null
  const appleSilicon = process.arch === 'arm64'
  return {
    appleSilicon,
    haasJa: appleSilicon && isExecutable(haasPaths().binary) && await isHaasAvailable(),
    qwenAsr: appleSilicon && isExecutable(findSpeechSwiftBinary()),
    appleSpeech: isMacAppleSpeechAvailable(),
    appleTranslate: supportsMac26Helpers() && isExecutable(findAppleTranslateBinary()),
    speakerIdentification: isMacSpeakerIdentificationAvailable()
  }
}
