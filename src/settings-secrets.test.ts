/**
 * Regression tests for the secret-redaction fix in 0.11.5. Settings → Export and Save-as-Profile
 * used to serialize the whole settings object, leaking `elevenLabsApiKey` and `obsPassword` into a
 * user-shareable JSON file. redactSecrets removes them; removal (not blanking) is what lets an
 * imported profile re-apply via Object.assign without wiping the recipient's own live key.
 */
import { describe, expect, test } from 'bun:test';
import { SECRET_SETTING_KEYS, redactSecrets } from './settings-secrets';

describe('redactSecrets', () => {
  test('removes every secret key from the copy', () => {
    const input = {
      elevenLabsApiKey: 'sk-super-secret',
      obsPassword: 'hunter2',
      fontSize: 42,
      wsPort: 8765,
    };
    const out = redactSecrets(input);
    for (const key of SECRET_SETTING_KEYS) {
      expect(key in out).toBe(false);
    }
  });

  test('preserves all non-secret keys and values', () => {
    const input = { elevenLabsApiKey: 'x', fontSize: 42, wsHost: '127.0.0.1' };
    const out = redactSecrets(input);
    expect(out.fontSize).toBe(42);
    expect(out.wsHost).toBe('127.0.0.1');
  });

  test('does not mutate the original settings object', () => {
    const input = { elevenLabsApiKey: 'keep-me-live', obsPassword: 'keep-me-too' };
    redactSecrets(input);
    expect(input.elevenLabsApiKey).toBe('keep-me-live');
    expect(input.obsPassword).toBe('keep-me-too');
  });

  test('removes the key entirely rather than blanking it (Object.assign-safe)', () => {
    const out = redactSecrets({ elevenLabsApiKey: 'x' }) as Record<string, unknown>;
    // absent, not '' — so `Object.assign(live, out)` won't overwrite a real key with empty
    expect(Object.prototype.hasOwnProperty.call(out, 'elevenLabsApiKey')).toBe(false);
  });

  test('a serialized redacted export contains no secret material', () => {
    const json = JSON.stringify(redactSecrets({
      elevenLabsApiKey: 'sk-leak',
      obsPassword: 'pw-leak',
      fontSize: 10,
    }));
    expect(json).not.toContain('sk-leak');
    expect(json).not.toContain('pw-leak');
    expect(json).toContain('fontSize');
  });
});
