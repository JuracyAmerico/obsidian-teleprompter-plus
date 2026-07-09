/**
 * Access-policy tests for the local control server.
 *
 * The two attacks these guard against — Cross-Site WebSocket Hijacking and DNS rebinding —
 * are default-on and triggerable by any website the user visits. Every case below is either
 * a real attacker origin that MUST be refused, or a legitimate local client that MUST keep working.
 */
import { describe, expect, test } from 'bun:test';
import { isHttpHostAllowed, isLocalHostname, isWebSocketOriginAllowed } from './net-access';

describe('isLocalHostname', () => {
  const local = [
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '127.5.5.5',
    '10.0.0.4',
    '192.168.1.20',
    '172.16.0.1',
    '172.31.255.254',
    '169.254.1.1',
    '::1',
    'fd12:3456::1', // unique-local
    'fe80::1', // link-local
    '::ffff:127.0.0.1', // IPv4-mapped loopback
  ];
  const remote = [
    'evil.com',
    'attacker.example',
    '8.8.8.8',
    '172.32.0.1', // just outside the private 172.16-31 range
    '172.15.0.1', // just below it
    '11.0.0.1',
    '193.168.1.1', // looks like 192.168 but isn't
    '2001:4860:4860::8888', // public IPv6 (Google DNS)
    'notlocalhost.com',
    'localhost.evil.com', // suffix trick — must NOT match
  ];
  test.each(local)('local: %s', (h) => expect(isLocalHostname(h)).toBe(true));
  test.each(remote)('remote: %s', (h) => expect(isLocalHostname(h)).toBe(false));
});

describe('isWebSocketOriginAllowed — CSWSH defense', () => {
  test('a public website is refused (the actual attack)', () => {
    expect(isWebSocketOriginAllowed('https://evil.com')).toBe(false);
    expect(isWebSocketOriginAllowed('http://attacker.example:1234')).toBe(false);
  });

  test('no Origin header is allowed — non-browser clients (Stream Deck) never send one', () => {
    expect(isWebSocketOriginAllowed(undefined)).toBe(true);
    expect(isWebSocketOriginAllowed('')).toBe(true);
  });

  test('the desktop remote page (loopback) is allowed', () => {
    expect(isWebSocketOriginAllowed('http://127.0.0.1:8080')).toBe(true);
    expect(isWebSocketOriginAllowed('http://localhost:8080')).toBe(true);
  });

  test('the phone remote page (LAN IP) is allowed', () => {
    expect(isWebSocketOriginAllowed('http://192.168.1.20:8080')).toBe(true);
  });

  test('an opaque/sandboxed origin ("null") is refused', () => {
    expect(isWebSocketOriginAllowed('null')).toBe(false);
  });

  test('a garbage Origin is refused, not crashed on', () => {
    expect(isWebSocketOriginAllowed('http://[not a url')).toBe(false);
  });
});

describe('isHttpHostAllowed — DNS-rebinding defense', () => {
  test('a rebound request (attacker domain in Host) is refused', () => {
    expect(isHttpHostAllowed('evil.com')).toBe(false);
    expect(isHttpHostAllowed('evil.com:8080')).toBe(false);
  });

  test('legit local Host headers are served', () => {
    expect(isHttpHostAllowed('127.0.0.1:8080')).toBe(true);
    expect(isHttpHostAllowed('localhost:8080')).toBe(true);
    expect(isHttpHostAllowed('192.168.1.20:8080')).toBe(true);
    expect(isHttpHostAllowed('[::1]:8080')).toBe(true);
  });

  test('absent Host is allowed — HTTP/1.0 and non-browser tooling', () => {
    expect(isHttpHostAllowed(undefined)).toBe(true);
  });

  test('a bare IPv6 Host with no port still parses', () => {
    expect(isHttpHostAllowed('[fe80::1]')).toBe(true);
    expect(isHttpHostAllowed('[2001:4860:4860::8888]:80')).toBe(false); // public
  });
});
