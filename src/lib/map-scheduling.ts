/** Coalesce map events, prop updates and resize notifications into one commit. */
export function createMapFrameScheduler(commit: () => void, request = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let frame: number | undefined;
  let disposed = false;
  return {
    request() {
      if (disposed || frame !== undefined) return;
      frame = request(() => {
        // Keep the token during commit: invalidateSize may synchronously emit moveend.
        try { if (!disposed) commit(); } finally { frame = undefined; }
      });
    },
    dispose() { disposed = true; if (frame !== undefined) cancel(frame); frame = undefined; },
  };
}

export interface ZoomQueueAdapter<Anchor> {
  getZoom: () => number;
  getMinZoom: () => number;
  getMaxZoom: () => number;
  apply: (zoom: number, anchor: Anchor | undefined) => void;
  schedule: () => void;
}

/** Leaflet's public wheel normalization feeds this queue. No map internals are used. */
export function createMapZoomQueue<Anchor>(adapter: ZoomQueueAdapter<Anchor>, snap = 0.25, pixelsPerLevel = 60, debounce = 40) {
  let busy = false;
  let inFlight: number | undefined;
  let target: number | undefined;
  let anchor: Anchor | undefined;
  let external: (() => void) | undefined;
  let delta = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const clamp = (zoom: number) => Math.max(adapter.getMinZoom(), Math.min(adapter.getMaxZoom(), snap ? Math.round(zoom / snap) * snap : zoom));
  function clearWheel() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined; delta = 0;
  }
  function increment(amount: number, at?: Anchor) {
    if (disposed || external) return;
    target = clamp((target ?? inFlight ?? adapter.getZoom()) + amount);
    anchor = at;
    adapter.schedule();
  }
  function commitWheel() {
    timer = undefined;
    const amount = delta; delta = 0;
    if (!amount) return;
    // Same sigmoid, sensitivity and fractional snap as Leaflet 1.9.4.
    const scaled = 4 * Math.log(2 / (1 + Math.exp(-Math.abs(amount / (pixelsPerLevel * 4))))) / Math.LN2;
    increment(Math.sign(amount) * (snap ? Math.ceil(scaled / snap) * snap : scaled), anchor);
  }
  return {
    get busy() { return busy; },
    get pendingView() { return external !== undefined; },
    get targetZoom() { return target ?? inFlight ?? adapter.getZoom(); },
    wheel(amount: number, at: Anchor) {
      if (disposed || external) return;
      delta += amount; anchor = at;
      // A batch ends 40ms after its first input, including reverse input.
      if (timer === undefined) timer = setTimeout(commitWheel, debounce);
    },
    increment(amount: number, at?: Anchor) {
      if (timer !== undefined) clearTimeout(timer);
      // A control click must not discard a wheel batch awaiting its 40ms deadline.
      commitWheel(); increment(amount, at);
    },
    zoomTo(zoom: number, at: Anchor) {
      if (disposed || external) return;
      clearWheel(); target = clamp(zoom); anchor = at; adapter.schedule();
    },
    replaceView(view: () => void) {
      if (disposed) return;
      clearWheel(); target = undefined; anchor = undefined; external = view; adapter.schedule();
    },
    zoomStart() { if (!disposed) busy = true; },
    zoomEnd() { if (!disposed) { busy = false; inFlight = undefined; adapter.schedule(); } },
    flush() {
      if (disposed || busy) return;
      if (external) {
        const view = external; external = undefined;
        view();
        return;
      }
      if (target === undefined) return;
      const next = clamp(target); const at = anchor;
      target = undefined;
      if (next === adapter.getZoom()) return; // No zoomend is emitted for a no-op.
      inFlight = next; busy = true; // setView starts its animation in a later RAF.
      adapter.apply(next, at); // Synchronous zoomend is allowed to clear busy here.
    },
    dispose() { disposed = true; clearWheel(); target = undefined; external = undefined; anchor = undefined; inFlight = undefined; busy = false; },
  };
}
