// Keep llama's ggml DLLs out of the process that owns Whisper and the UI.
async function probe(): Promise<void> {
  try {
    const { getLlama } = await import('node-llama-cpp')
    const llama = await getLlama({ gpu: 'auto', build: 'never', skipDownload: true })
    const gpuNames = (await llama.getGpuDeviceNames()).map(String)
    process.parentPort?.postMessage({ gpuNames })
  } catch (error) {
    process.parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
void probe()
