/**
 * Regression tests for the Kokoro code-injection fix in 0.11.6. kokoro-engine builds a Python script
 * by interpolating `voice="${voiceId}", speed=${speed}` and runs it via spawn(python, ['-c', script]).
 * Before this fix, voiceId/speed came from settings.ttsVoice/ttsRate with NO validation, so a crafted
 * value in a synced data.json could break out of the literal and execute arbitrary Python (RCE, gated
 * on Kokoro being installed). resolveVoiceId + clampSpeed make the interpolated values un-injectable.
 */
import { describe, expect, test } from 'bun:test';
import { resolveVoiceId, clampSpeed } from './kokoro-safety';

const ALLOWED = ['af_heart', 'af_alloy', 'am_adam'];

describe('resolveVoiceId', () => {
  test('passes through an allowlisted voice unchanged', () => {
    expect(resolveVoiceId('af_alloy', ALLOWED)).toBe('af_alloy');
  });

  test('collapses an unknown voice to the fallback', () => {
    expect(resolveVoiceId('af_notreal', ALLOWED)).toBe('af_heart');
  });

  test('collapses undefined/empty to the fallback', () => {
    expect(resolveVoiceId(undefined, ALLOWED)).toBe('af_heart');
    expect(resolveVoiceId('', ALLOWED)).toBe('af_heart');
  });

  test('a Python-injection payload never survives — resolves to the safe fallback', () => {
    const payload = 'af_heart", speed=1.0)\nimport os\nos.system("id")\n#';
    const resolved = resolveVoiceId(payload, ALLOWED);
    expect(resolved).toBe('af_heart');
    // The value that gets interpolated contains no quote/paren/newline — structurally inert.
    expect(/["'()\n]/.test(resolved)).toBe(false);
  });

  test('the resolved value is always a member of the allowlist', () => {
    for (const evil of ['"; drop', '$(x)', '`x`', 'af_heart\\', 'x'.repeat(5000)]) {
      expect(ALLOWED).toContain(resolveVoiceId(evil, ALLOWED));
    }
  });
});

describe('clampSpeed', () => {
  test('passes a normal in-range rate through', () => {
    expect(clampSpeed(1.25)).toBe(1.25);
  });

  test('clamps out-of-range numbers to the bounds', () => {
    expect(clampSpeed(99)).toBe(2.0);
    expect(clampSpeed(-5)).toBe(0.5);
  });

  test('a non-numeric injection string collapses to the fallback number', () => {
    expect(clampSpeed('1.0)\nimport os')).toBe(1.0);
    expect(clampSpeed(undefined)).toBe(1.0);
    expect(clampSpeed(NaN)).toBe(1.0);
    expect(clampSpeed(Infinity)).toBe(1.0);
  });

  test('the result is always a finite number (safe to interpolate as speed=${n})', () => {
    for (const evil of ['x', '1;rm', '(', NaN, Infinity, -Infinity, undefined, {}]) {
      const s = clampSpeed(evil);
      expect(Number.isFinite(s)).toBe(true);
    }
  });
});
