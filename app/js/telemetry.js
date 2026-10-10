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

// Three clocks, because one is not enough and mixing them is a trap.
//
//   t      wall clock, ISO. Human-readable and comparable with the server's
//          line for the same drape -- but it can JUMP. new Date() follows the
//          system clock, so an NTP correction mid-session makes a phase look
//          instantaneous or negative.
//   ms     monotonic milliseconds since this session started
//          (performance.now()), which cannot jump and is what any DURATION
//          should be computed from.
//   dtMs   monotonic milliseconds since the PREVIOUS event, so how long a
//          phase took is a field rather than a subtraction the reader has to
//          do across a 4-second batching window.
//
// And a fourth lives in the payload: `simSeconds`, the simulation's own
// clock. A sewing pass that takes 4.2 s of simulated time may take any amount
// of wall time depending on substeps and machine, and conflating the two is
// how "it is slow" and "it is sewing slowly" get confused.
const mono = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now() : Date.now());
let T0 = mono();
let tPrev = T0;

/** Post whatever has accumulated. Never throws, never blocks the caller. */
async function flush() {
  if (!CONFIG.enabled || !CONFIG.url || !QUEUE.length) return;
  const batch = QUEUE;
  QUEUE = [];
  try {
    await fetch(`${CONFIG.url}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // When the BATCH left, as well as when each event happened. The server
      // can only stamp arrival, and arrival is up to a flush interval after
      // the fact -- measured, 57 s on a slow page, which is long enough to
      // reorder events against the server's own lines if anyone trusted it.
      // With `sentMs` the queue delay is (sentMs - event.ms), both from the
      // same monotonic clock; with `sentT` the transport-plus-skew is
      // (srvT - sentT). Neither has to be guessed from the other.
      body: JSON.stringify({
        session: CONFIG.session,
        sentT: now(),
        sentMs: +(mono() - T0).toFixed(1),
        events: batch,
      }),
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
    const m = mono();
    QUEUE.push({
      t: now(),
      ms: +(m - T0).toFixed(1),
      dtMs: +(m - tPrev).toFixed(1),
      event,
      ...data,
    });
    tPrev = m;
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

  T0 = mono();
  tPrev = T0;
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
