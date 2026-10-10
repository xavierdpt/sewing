// What the viewer tells the side-car about itself.
//
// Until this existed the answer was "nothing": the viewer posted a mesh and
// got vertices back, and every diagnostic -- phase timings, seam tension,
// how much of the body was through the cloth, and every uncaught exception --
// stayed in a browser console nobody could read but the person sitting at it.
// Two bugs this session were found only because a human copied console output
// into a chat window, and one of them (the side-car crash) had already shown
// up in an automated run as "nothing happened" and been mistaken for a
// timeout.
//
// So the viewer now emits the same measurements the headless trace prints
// (tools/trace.mjs), as JSON lines the server appends to a file. The point is
// parity: a session in the browser and a run in node should produce the same
// numbers for the same garment, and when they do not, the difference is the
// bug.
//
// Everything is best-effort. Telemetry that can break the viewer is worse
// than no telemetry, so every call is wrapped and failure is silent.

let CONFIG = { url: null, enabled: false, session: null };
let QUEUE = [];
let timer = null;

const now = () => new Date().toISOString();

/** Post whatever has accumulated. Never throws, never blocks the caller. */
async function flush() {
  if (!CONFIG.enabled || !CONFIG.url || !QUEUE.length) return;
  const batch = QUEUE;
  QUEUE = [];
  try {
    await fetch(`${CONFIG.url}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: CONFIG.session, events: batch }),
      keepalive: true,
    });
  } catch {
    // the side-car may simply not be running; drop it rather than grow
    // without bound
  }
}

/**
 * Record an event. `data` should be numbers you would want in a table, not
 * prose -- the whole value of this is that two runs can be diffed.
 */
export function tlog(event, data = {}) {
  if (!CONFIG.enabled) return;
  try {
    QUEUE.push({ t: now(), event, ...data });
    if (QUEUE.length >= 32) flush();
  } catch { /* never let logging break the thing it is logging */ }
}

/**
 * Start logging to the side-car.
 *
 * Hooks the two things that were invisible before: uncaught exceptions, and
 * rejected promises. The side-car crash was an unhandled rejection inside an
 * async handler -- it killed the drape silently and the only trace was that
 * nothing happened.
 */
export function startTelemetry({ url, enabled = true, flushMs = 4000 } = {}) {
  CONFIG = {
    url,
    enabled,
    session: `${new Date().toISOString().replace(/[:.]/g, '-')}-`
      + Math.random().toString(36).slice(2, 8),
  };
  if (!enabled) return CONFIG.session;

  addEventListener('error', (e) => tlog('uncaught', {
    message: String(e.message || e.error || e),
    source: `${e.filename || '?'}:${e.lineno || 0}`,
  }));
  addEventListener('unhandledrejection', (e) => tlog('unhandled-rejection', {
    message: String((e.reason && (e.reason.stack || e.reason.message)) || e.reason),
  }));
  addEventListener('beforeunload', () => {
    // sendBeacon survives the page going away, which fetch does not
    try {
      if (QUEUE.length && navigator.sendBeacon) {
        navigator.sendBeacon(`${CONFIG.url}/log`, new Blob(
          [JSON.stringify({ session: CONFIG.session, events: QUEUE })],
          { type: 'application/json' },
        ));
        QUEUE = [];
      }
    } catch { /* going away anyway */ }
  });

  if (timer) clearInterval(timer);
  timer = setInterval(flush, flushMs);
  tlog('session-start', {
    userAgent: navigator.userAgent,
    screen: `${innerWidth}x${innerHeight}`,
  });
  return CONFIG.session;
}

export const telemetrySession = () => CONFIG.session;
export const flushTelemetry = flush;
