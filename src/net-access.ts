/**
 * Access policy for the local control server (WebSocket + HTTP).
 *
 * THE THREAT: the server binds to localhost, but "localhost" does not protect against a
 * malicious *web page*, because that page's JavaScript runs inside the user's own browser,
 * which is on localhost. Two concrete attacks a page on evil.com can run while the plugin is on:
 *
 *   1. Cross-Site WebSocket Hijacking (CSWSH): `new WebSocket('ws://127.0.0.1:<port>')`.
 *      Browsers do NOT apply the same-origin policy to WebSocket connections, so without an
 *      Origin check any site can connect and drive the teleprompter / read state broadcasts.
 *   2. DNS rebinding on the HTTP endpoints: evil.com rebinds its DNS to 127.0.0.1, so
 *      `fetch('/api/state')` becomes *same-origin* from the browser's view and CORS never
 *      applies. The tell is the `Host` header — it still says `evil.com`, not a local address.
 *
 * THE POLICY: a request is trusted only if it plausibly originates from this machine or its
 * LAN — i.e. the Origin (for WS) or Host (for HTTP) names a loopback or RFC1918/link-local
 * address, OR the header is absent (non-browser clients like the Stream Deck plugin never send
 * Origin; a browser mounting CSWSH always does). Any public hostname is refused.
 *
 * This is what lets the legit paths keep working — desktop via 127.0.0.1, phone via the LAN IP,
 * Stream Deck with no Origin — while a page served from a public domain is turned away.
 */

/** Strip an IPv6 bracket wrapper and any `%zone` suffix, lowercase the rest. */
function normalizeHostname(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  const zone = h.indexOf('%');
  if (zone !== -1) h = h.slice(0, zone);
  return h;
}

/**
 * Is this hostname a loopback, private (RFC1918), or link-local address — i.e. an address that
 * can only be reached from this machine or its local network? A public domain returns false.
 */
export function isLocalHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (!h) return false;

  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  // IPv6 loopback, unique-local (fc00::/7 -> fc.., fd..), link-local (fe80::/10)
  if (h === '::1') return true;
  if (/^f[cd][0-9a-f]*:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]*:/.test(h)) return true;
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  const ipv4 = mapped ? mapped[1] : h;

  // IPv4 ranges: loopback 127/8, private 10/8, 172.16-31/12, 192.168/16, link-local 169.254/16
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ipv4)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ipv4)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ipv4)) return true;

  return false;
}

/** Hostname portion of an Origin URL like `http://127.0.0.1:8080`, or null if unparseable. */
function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname || null;
  } catch {
    return null;
  }
}

/** Hostname portion of a Host header like `192.168.1.5:8080` or `[::1]:8080`. */
function hostHeaderHostname(host: string): string {
  const h = host.trim();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1); // keep brackets for normalize
  const colon = h.lastIndexOf(':');
  // A bare IPv6 with no port has multiple colons and no brackets — leave it whole.
  if (colon !== -1 && h.indexOf(':') === colon) return h.slice(0, colon);
  return h;
}

/**
 * Should a WebSocket upgrade with this Origin header be accepted?
 * Absent/empty Origin => non-browser client => allow. Otherwise the Origin must be local.
 */
export function isWebSocketOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return true; // non-browser clients (Stream Deck, native) send no Origin
  if (origin === 'null') return false; // sandboxed iframe / opaque origin — never trust
  const hostname = originHostname(origin);
  if (!hostname) return false;
  return isLocalHostname(hostname);
}

/**
 * Should an HTTP request with this Host header be served? Absent Host (HTTP/1.0, non-browser)
 * => allow. A present Host must be local — this is the DNS-rebinding defense.
 */
export function isHttpHostAllowed(host: string | undefined | null): boolean {
  if (!host) return true;
  return isLocalHostname(hostHeaderHostname(host));
}
