import { createLogger } from '../main/logger'
import { utilityProcess } from 'electron'
import { join } from 'path'

const log = createLogger('gpu-detector')

/**
 * GPU detection via node-llama-cpp.
 * Returns detected GPU names and whether a GPU is available.
 * Fails gracefully if node-llama-cpp is not installed.
 */
export interface GpuInfo {
  hasGpu: boolean
  gpuNames: string[]
}

let cachedResult: GpuInfo | null = null
let pending: Promise<GpuInfo> | null = null

export function detectGpu(): Promise<GpuInfo> {
  if (cachedResult) return Promise.resolve(cachedResult)
  if (pending) return pending
  // Preserve the established macOS/Linux detection path. The native DLL
  // namespace collision reproduced in this investigation is Windows-specific.
  if (process.platform !== 'win32') {
    pending = (async (): Promise<GpuInfo> => {
      try {
        const { getLlama } = await import('node-llama-cpp')
        const llama = await getLlama({ gpu: 'auto' })
        const gpuNames = (await llama.getGpuDeviceNames()).map(String)
        cachedResult = { hasGpu: gpuNames.length > 0, gpuNames }
        return cachedResult
      } catch (error) {
        log.warn('Failed to detect GPU:', error)
        return { hasGpu: false, gpuNames: [] }
      }
    })().finally(() => { pending = null })
    return pending
  }
  // Whisper and llama bundle different ggml DLLs with the same basename on
  // Windows. Never load both libraries in Electron's main process.
  pending = new Promise<GpuInfo>((resolve) => {
    let child: ReturnType<typeof utilityProcess.fork> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = (info?: GpuInfo, error?: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (info) cachedResult = info
      if (error) log.warn('GPU probe unavailable:', error)
      child?.kill()
      resolve(info ?? { hasGpu: false, gpuNames: [] })
    }
    try {
      child = utilityProcess.fork(join(__dirname, 'gpu-probe.js'), [], { serviceName: 'VocaLume GPU probe', stdio: 'ignore' })
      timer = setTimeout(() => finish(undefined, 'Timed out after 15 seconds'), 15000)
      child.on('message', (message: { gpuNames?: unknown; error?: unknown }) => {
        if (Array.isArray(message?.gpuNames) && message.gpuNames.every(name => typeof name === 'string')) {
          finish({ hasGpu: message.gpuNames.length > 0, gpuNames: message.gpuNames })
        } else finish(undefined, message?.error ?? 'Invalid probe response')
      })
      child.on('exit', code => finish(undefined, `Probe exited (${code})`))
    } catch (error) { finish(undefined, error) }
  }).finally(() => { pending = null })
  return pending
}

export function clearGpuCache(): void {
  cachedResult = null
}
