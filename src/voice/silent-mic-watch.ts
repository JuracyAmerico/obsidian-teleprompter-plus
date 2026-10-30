/**
 * Detect a microphone that macOS has blocked. When Obsidian's microphone permission is off,
 * getUserMedia still succeeds but every sample is exactly 0.0, so voice tracking looked like it
 * was listening while hearing nothing (runtime test 2026-10-30: 24 s "listening", 0 words).
 * A real microphone always carries some noise, even in a silent room, so exact zeros over a few
 * seconds mean the stream is blocked, not that the reader is quiet.
 */

/** How long a stream may deliver only exact zeros before it is reported as blocked. */
export const SILENT_MIC_TIMEOUT_MS = 4000

export function hasSignal(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] !== 0) return true
  }
  return false
}

/** Feed it audio chunks; it calls onBlocked once if none carried signal within the timeout. */
export class SilentMicWatch {
  private sawSignal = false
  private timer: ReturnType<typeof setTimeout> | null

  constructor(onBlocked: () => void, timeoutMs = SILENT_MIC_TIMEOUT_MS) {
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.sawSignal) onBlocked()
    }, timeoutMs)
  }

  feed(samples: Float32Array): void {
    if (this.sawSignal) return
    if (hasSignal(samples)) {
      this.sawSignal = true
      this.cancel()
    }
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
