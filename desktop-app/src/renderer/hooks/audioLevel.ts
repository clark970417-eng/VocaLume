/** Only the meter subscribes to this frequently changing value. */
export function createAudioLevel() {
  let level = 0
  const listeners = new Set<() => void>()
  return {
    read: () => level,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    hasListeners: () => listeners.size > 0,
    update(value: number) {
      if (level === value) return
      level = value
      listeners.forEach(listener => listener())
    }
  }
}

export type AudioLevel = ReturnType<typeof createAudioLevel>
