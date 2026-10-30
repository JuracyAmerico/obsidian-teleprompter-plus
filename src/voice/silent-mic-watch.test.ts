import { describe, expect, test } from 'bun:test'
import { SilentMicWatch, hasSignal } from './silent-mic-watch'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('SilentMicWatch', () => {
  test('blocked mic of exact zeros is reported', async () => {
    let blocked = 0
    const watch = new SilentMicWatch(() => { blocked++ }, 20)
    watch.feed(new Float32Array(128))
    watch.feed(new Float32Array(128))
    await wait(40)
    expect(blocked).toBe(1)
  })

  test('quiet room noise is not reported', async () => {
    let blocked = 0
    const watch = new SilentMicWatch(() => { blocked++ }, 20)
    const noise = new Float32Array(128)
    noise[5] = 0.00003
    watch.feed(noise)
    await wait(40)
    expect(blocked).toBe(0)
  })

  test('cancel on stop never reports', async () => {
    let blocked = 0
    const watch = new SilentMicWatch(() => { blocked++ }, 20)
    watch.cancel()
    await wait(40)
    expect(blocked).toBe(0)
  })

  test('hasSignal', () => {
    expect(hasSignal(new Float32Array(4))).toBe(false)
    expect(hasSignal(Float32Array.from([0, -0.0001, 0]))).toBe(true)
  })
})
