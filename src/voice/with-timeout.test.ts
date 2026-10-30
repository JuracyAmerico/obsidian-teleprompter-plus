import { describe, expect, test } from 'bun:test'
import { StartTimeoutError, withTimeout } from './with-timeout'

async function outcome<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await p }
  } catch (error) {
    return { error }
  }
}

describe('withTimeout', () => {
  test('hung mic request rejects with StartTimeoutError', async () => {
    const never = new Promise<string>(() => {})
    const r = await outcome(withTimeout(never, 20))
    expect(r.error).toBeInstanceOf(StartTimeoutError)
  })

  test('a value in time passes through', async () => {
    const r = await outcome(withTimeout(Promise.resolve('ok'), 50))
    expect(r.value).toBe('ok')
  })

  test('a rejection in time passes through', async () => {
    const r = await outcome(withTimeout(Promise.reject(new Error('NotAllowedError')), 50))
    expect((r.error as Error).message).toBe('NotAllowedError')
  })

  test('late value is released', async () => {
    const released: string[] = []
    const late = new Promise<string>((resolve) => setTimeout(() => resolve('stream'), 40))
    const r = await outcome(withTimeout(late, 10, (v) => { released.push(v) }))
    expect(r.error).toBeInstanceOf(StartTimeoutError)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(released).toEqual(['stream'])
  })
})
