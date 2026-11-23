import { execFileSync, execSync, spawnSync } from 'child_process'
import { win32 } from 'node:path'
import { createLogger } from './logger'

const log = createLogger('mdm-config')

/** MDM-managed configuration profile for enterprise deployment */
export interface MdmConfig {
  /** Lock engine selection to a specific engine mode */
  lockedEngine: string | null
  /** Lock STT engine to a specific engine */
  lockedSttEngine: string | null
  /** Force-disable telemetry regardless of user preference */
  telemetryDisabled: boolean
  /** Managed API key (set by admin, hidden from user) */
  managedApiKey: string | null
  /** Managed DeepL API key */
  managedDeeplApiKey: string | null
  /** Managed Gemini API key */
  managedGeminiApiKey: string | null
  /** Managed Microsoft (Azure) Translator API key (#704) */
  managedMicrosoftApiKey: string | null
  /** Managed Microsoft (Azure) Translator region (e.g. "japaneast") (#704) */
  managedMicrosoftRegion: string | null
  /** Managed OpenAI API key for cloud realtime translation (#722) */
  managedOpenaiApiKey: string | null
  /** Managed Gemini Live API key for realtime translation (#723) */
  managedGeminiLiveApiKey: string | null
  /** Custom organization name shown in UI */
  organizationName: string | null
  /** Disable auto-update (enterprise may manage updates via MDM) */
  autoUpdateDisabled: boolean
}

const BUNDLE_ID = 'com.live-translate.app'
const WINDOWS_POLICY_PATH = 'SOFTWARE\\Policies\\VocaLume'
const MDM_READ_TIMEOUT_MS = 2000
const WINDOWS_POLICY_NAMES = [
  'lockedEngine', 'lockedSttEngine', 'telemetryDisabled', 'managedApiKey',
  'managedDeeplApiKey', 'managedGeminiApiKey', 'managedMicrosoftApiKey',
  'managedMicrosoftRegion', 'managedOpenaiApiKey', 'managedGeminiLiveApiKey',
  'organizationName', 'autoUpdateDisabled'
] as const satisfies readonly (keyof MdmConfig)[]

/** Cached MDM config — loaded once at startup */
let cachedConfig: MdmConfig | null = null

/**
 * Read a single managed preference value from the macOS defaults system.
 *
 * On macOS, MDM-deployed configuration profiles write to
 * /Library/Managed Preferences/<bundle-id>.plist
 * which can be read via `defaults read` in the managed domain.
 *
 * Returns null if the key doesn't exist or on non-macOS platforms.
 */
function readManagedPref(key: string): string | null {
  if (process.platform !== 'darwin') return null

  try {
    // Read from the managed preferences domain
    // MDM profiles are deployed to /Library/Managed Preferences/
    const result = execSync(
      `defaults read "/Library/Managed Preferences/${BUNDLE_ID}" ${key} 2>/dev/null`,
      { encoding: 'utf-8', timeout: MDM_READ_TIMEOUT_MS }
    ).trim()
    return result || null
  } catch {
    // Key not found or not managed — this is expected for non-managed devices
    return null
  }
}

/** Read the machine policy without printing values or consulting user-writable keys. */
function readWindowsPolicy(): Partial<Record<keyof MdmConfig, unknown>> {
  const systemDir = win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  const options = { windowsHide: true, timeout: MDM_READ_TIMEOUT_MS }
  try {
    // Avoid starting PowerShell on the common path where there is no machine policy.
    const probe = spawnSync(win32.join(systemDir, 'reg.exe'), [
      'query', `HKLM\\${WINDOWS_POLICY_PATH}`, '/reg:64'
    ], { ...options, stdio: 'ignore' })
    if (probe.status !== 0) return {}

    // Registry APIs preserve non-ASCII organization names and the original value types.
    const script = `
      $ErrorActionPreference = 'Stop'
      [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
      $machine = [Microsoft.Win32.RegistryKey]::OpenBaseKey('LocalMachine', 'Registry64')
      $key = $machine.OpenSubKey('${WINDOWS_POLICY_PATH}')
      $values = @{}
      if ($key) {
        foreach ($name in @(${WINDOWS_POLICY_NAMES.map((name) => `'${name}'`).join(', ')})) {
          $value = $key.GetValue($name, $null, 'DoNotExpandEnvironmentNames')
          if ($null -eq $value) { continue }
          $kind = $key.GetValueKind($name)
          if ($kind -eq 'String' -or $kind -eq 'DWord') { $values[$name] = $value }
        }
        $key.Dispose()
      }
      $machine.Dispose()
      $values | ConvertTo-Json -Compress
    `
    const json = execFileSync(win32.join(systemDir, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { ...options, encoding: 'utf-8', maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    const values: unknown = JSON.parse(json)
    if (values && typeof values === 'object' && !Array.isArray(values)) return values
  } catch {
    log.warn('Unable to read Windows machine policy')
  }
  return {}
}

/** Load settings once from the operating system's managed policy source. */
export function loadMdmConfig(): MdmConfig {
  if (cachedConfig) return cachedConfig

  log.info('Loading MDM managed preferences...')

  const windows = process.platform === 'win32' ? readWindowsPolicy() : null
  const readString = (key: keyof MdmConfig): string | null => {
    if (!windows) return readManagedPref(key)
    const value = windows[key]
    return typeof value === 'string' ? value.trim() || null : null
  }
  const readBoolean = (key: keyof MdmConfig): boolean =>
    windows ? windows[key] === 1 : readManagedPref(key) === '1'

  const config: MdmConfig = {
    lockedEngine: readString('lockedEngine'),
    lockedSttEngine: readString('lockedSttEngine'),
    telemetryDisabled: readBoolean('telemetryDisabled'),
    managedApiKey: readString('managedApiKey'),
    managedDeeplApiKey: readString('managedDeeplApiKey'),
    managedGeminiApiKey: readString('managedGeminiApiKey'),
    managedMicrosoftApiKey: readString('managedMicrosoftApiKey'),
    managedMicrosoftRegion: readString('managedMicrosoftRegion'),
    managedOpenaiApiKey: readString('managedOpenaiApiKey'),
    managedGeminiLiveApiKey: readString('managedGeminiLiveApiKey'),
    organizationName: readString('organizationName'),
    autoUpdateDisabled: readBoolean('autoUpdateDisabled')
  }

  // Log which settings are managed (without revealing sensitive values)
  const managed: string[] = []
  if (config.lockedEngine) managed.push(`lockedEngine=${config.lockedEngine}`)
  if (config.lockedSttEngine) managed.push(`lockedSttEngine=${config.lockedSttEngine}`)
  if (config.telemetryDisabled) managed.push('telemetryDisabled')
  if (config.managedApiKey) managed.push('managedApiKey=***')
  if (config.managedDeeplApiKey) managed.push('managedDeeplApiKey=***')
  if (config.managedGeminiApiKey) managed.push('managedGeminiApiKey=***')
  if (config.managedMicrosoftApiKey) managed.push('managedMicrosoftApiKey=***')
  if (config.managedMicrosoftRegion) managed.push(`managedMicrosoftRegion=${config.managedMicrosoftRegion}`)
  if (config.managedOpenaiApiKey) managed.push('managedOpenaiApiKey=***')
  if (config.managedGeminiLiveApiKey) managed.push('managedGeminiLiveApiKey=***')
  if (config.organizationName) managed.push(`org=${config.organizationName}`)
  if (config.autoUpdateDisabled) managed.push('autoUpdateDisabled')

  if (managed.length > 0) {
    log.info('MDM managed settings:', managed.join(', '))
  } else {
    log.info('No MDM managed preferences found (unmanaged device)')
  }

  cachedConfig = config
  return config
}

/** Get the cached MDM config (must call loadMdmConfig first) */
export function getMdmConfig(): MdmConfig {
  return cachedConfig ?? loadMdmConfig()
}

/** Check if a specific setting is admin-locked */
export function isEngineLocked(): boolean {
  return getMdmConfig().lockedEngine !== null
}

/** Check if STT engine is admin-locked */
export function isSttEngineLocked(): boolean {
  return getMdmConfig().lockedSttEngine !== null
}

/** Clear cached config (for testing or config reload) */
export function clearMdmConfigCache(): void {
  cachedConfig = null
}
