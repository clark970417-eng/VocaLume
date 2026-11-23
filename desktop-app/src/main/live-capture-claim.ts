import { createServer } from 'node:net'
import { resolveBridgeScript } from '../engines/SubprocessBridge'
import { claimMacCapture } from '../../../extension/desktop/capture-lease.mjs'

/** The OS releases a capture claim when its holder exits. */
export function claimLiveCapture(path: string): Promise<(() => void) | null> {
  if (process.platform === 'darwin') return claimMacCapture(resolveBridgeScript('bin/capture-claim-helper'), path)
  return new Promise((resolve, reject) => {
    const server = createServer(socket => socket.destroy())
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(null)
      else reject(error)
    })
    server.listen(path, () => {
      server.unref()
      resolve(() => server.close())
    })
  })
}
