export function createInputLevel() {
  let level = 0
  let visible = false
  const listeners = new Set<() => void>()

  function update(value: number): void {
    if (level === value) return
    level = value
    for (const notify of listeners) notify()
  }

  return {
    getSnapshot: () => level,
    subscribe(notify: () => void) {
      listeners.add(notify)
      return () => { listeners.delete(notify) }
    },
    setVisible(next: boolean) {
      visible = next
      if (!next) update(0)
    },
    get needsSample() { return visible && listeners.size > 0 },
    measure(frame: Float32Array) {
      let squares = 0
      for (let i = 0; i < frame.length; i++) squares += frame[i] * frame[i]
      update(Math.min(100, Math.round(Math.sqrt(squares / frame.length) * 500)))
    },
    reset: () => update(0)
  }
}

export type InputLevel = ReturnType<typeof createInputLevel>
