/**
 * Bound a promise that may never settle. On macOS, a microphone request from Obsidian whose
 * permission is switched off can hang instead of rejecting, which left voice tracking on
 * "Initializing…" forever with no message.
 */

export class StartTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StartTimeoutError'
  }
}

/** Resolve or reject with `promise`, or reject with StartTimeoutError after `ms`. A value that
 *  arrives after the timeout is handed to `onLate` so it can be released (e.g. stop a mic stream). */
export function withTimeout<T>(promise: Promise<T>, ms: number, onLate?: (_value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      reject(new StartTimeoutError(`Timed out after ${ms} ms`))
    }, ms)
    promise.then(
      (value) => {
        if (timedOut) { onLate?.(value); return }
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        if (timedOut) return
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
