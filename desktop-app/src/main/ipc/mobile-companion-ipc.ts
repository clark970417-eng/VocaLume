import { ipcMain, shell } from 'electron'
import { isGGUFDownloaded, PLAMO_3_VARIANTS } from '../../engines/model-downloader'
import { PLaMo3Translator } from '../../engines/translator/PLaMo3Translator'
import type { AppContext } from '../app-context'
import { getMobileCompanionStatus, startMobileCompanion, stopMobileCompanion } from '../mobile-companion'
import { createTextTranslator } from './text-translation-ipc'
import { store } from '../store'

export function registerMobileCompanionIpc(ctx: AppContext): void {
  const translate = createTextTranslator(ctx, () => {
    if (!isGGUFDownloaded(PLAMO_3_VARIANTS.Q4_K_M.filename)) {
      throw new Error('Download PLaMo 3 Translate 0.8B from the desktop Models tab, then try again.')
    }
    return new PLaMo3Translator({ kvCacheQuant: store.get('slmKvCacheQuant') })
  })

  ipcMain.handle('mobile-companion-status', () => getMobileCompanionStatus())
  ipcMain.handle('set-mobile-companion', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid mobile companion preference')
    if (enabled) return startMobileCompanion(translate)
    stopMobileCompanion()
    return null
  })
  ipcMain.handle('open-mobile-companion', async () => {
    const status = getMobileCompanionStatus()
    if (status) await shell.openExternal(status.url)
  })
}
