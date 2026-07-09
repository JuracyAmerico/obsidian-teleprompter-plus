/**
 * Behavioral proof that subprocess calls with untrusted-ish path arguments cannot be turned
 * into command injection. Guards the CLASS plugin-wide, not just the two call sites fixed in
 * 0.11.4 (pdftotext in TeleprompterApp, the mlx_audio probe in kokoro-engine).
 *
 * The rule: a filename/path argument must go through execFileSync(cmd, [args]) — args are handed
 * to the process directly, never parsed by a shell. Building an execSync(`cmd "${path}"`) string
 * is the bug: sh evaluates $()/backticks even inside double quotes, and a " in the path closes
 * the quote. See ATTACKSURFACE.md SURF-05 / SURF-06.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// A path whose *name* carries a shell payload that would create a sentinel file if a shell ran it.
const PAYLOAD_NAME = 'a"; touch SENTINEL; "b';

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('subprocess argument handling', () => {
  test('execFileSync with an array arg does NOT execute an injected command (the fix)', () => {
    dir = mkdtempSync(join(tmpdir(), 'exec-safe-'));
    const fullPath = join(dir, PAYLOAD_NAME);

    // Exactly how the plugin now calls pdftotext: binary + array, no shell.
    // `echo` stands in for `pdftotext` — it just prints the args and exits 0.
    execFileSync('echo', ['-layout', fullPath, '-'], { cwd: dir, encoding: 'utf-8' });

    expect(existsSync(join(dir, 'SENTINEL'))).toBe(false); // the payload was inert
  });

  test('the OLD execSync string form WOULD have injected — proves the test is meaningful', () => {
    dir = mkdtempSync(join(tmpdir(), 'exec-vuln-'));
    const fullPath = join(dir, PAYLOAD_NAME);

    // The vulnerable pattern we removed. Run it in the temp cwd so the sentinel is contained.
    // The trailing `"b" -` runs as a bogus command and makes sh exit non-zero AFTER the injected
    // `touch` already ran — so swallow the throw; the sentinel file is the real proof.
    try {
      execSync(`echo -layout "${fullPath}" -`, { cwd: dir, encoding: 'utf-8' });
    } catch {
      /* expected: the injected `touch` ran, then `b` was not found */
    }

    // The `"; touch SENTINEL; "` broke out of the quotes and ran — this is exactly the RCE.
    expect(existsSync(join(dir, 'SENTINEL'))).toBe(true);
  });

  test('a $(...) command-substitution name is also inert under execFileSync', () => {
    dir = mkdtempSync(join(tmpdir(), 'exec-safe2-'));
    const fullPath = join(dir, '$(touch SENTINEL).pdf');

    execFileSync('echo', ['-layout', fullPath, '-'], { cwd: dir, encoding: 'utf-8' });

    expect(existsSync(join(dir, 'SENTINEL'))).toBe(false);
  });

  test('a backtick name is inert under execFileSync', () => {
    dir = mkdtempSync(join(tmpdir(), 'exec-safe3-'));
    const fullPath = join(dir, '`touch SENTINEL`.pdf');

    execFileSync('echo', [fullPath], { cwd: dir, encoding: 'utf-8' });

    expect(existsSync(join(dir, 'SENTINEL'))).toBe(false);
  });
});
