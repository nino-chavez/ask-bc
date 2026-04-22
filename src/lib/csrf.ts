import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

/**
 * Origin / Sec-Fetch-Site check for cookie-authenticated state-changing
 * routes. The session cookie uses SameSite=none (required for iframe
 * embedding inside the BC admin), which removes SameSite's built-in
 * CSRF protection. This helper puts it back.
 *
 * Defends against: an attacker page that calls fetch() to our API
 * cross-origin in a logged-in user's browser.
 *
 * Does NOT defend against: a page that iframes our app and triggers
 * fetches from inside the iframe — same-origin from the iframe's POV.
 * That case requires `Content-Security-Policy: frame-ancestors` to
 * restrict who can embed us.
 *
 * Returns null if the request passes the check. Returns an error string
 * if the request should be rejected with 403.
 */
export function assertSameOrigin(request: NextRequest): string | null {
  const sfs = request.headers.get('sec-fetch-site');

  // Modern browsers send Sec-Fetch-Site. 'same-origin' is our iframe
  // talking to its own /api/*. 'none' is direct navigation, not
  // applicable to POST/PUT but harmless to allow. Reject everything else.
  if (sfs) {
    if (sfs === 'same-origin' || sfs === 'none') return null;
    return `Cross-site request rejected (sec-fetch-site=${sfs})`;
  }

  // Fallback for browsers that don't send Sec-Fetch-Site: check Origin
  // header matches APP_ORIGIN exactly.
  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin header is suspicious on a POST/PUT. Reject.
    return 'Missing Origin header on state-changing request';
  }

  try {
    const appOriginHost = new URL(env.APP_ORIGIN).origin;
    const reqOriginHost = new URL(origin).origin;
    if (appOriginHost !== reqOriginHost) {
      return `Origin mismatch: got ${reqOriginHost}, expected ${appOriginHost}`;
    }
  } catch {
    return 'Malformed Origin header';
  }

  return null;
}
