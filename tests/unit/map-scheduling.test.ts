import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapFrameScheduler, createMapZoomQueue } from "../../src/lib/map-scheduling";

afterEach(() => vi.useRealTimers());

describe("map frame scheduling", () => {
  it("coalesces zoomend, moveend and resize, including synchronous events during commit", () => {
    let run!: FrameRequestCallback;
    const request = vi.fn((callback: FrameRequestCallback) => { run = callback; return 1; });
    const commit = vi.fn(() => scheduler.request());
    const scheduler = createMapFrameScheduler(commit, request, vi.fn());
    scheduler.request(); scheduler.request(); scheduler.request();
    expect(request).toHaveBeenCalledTimes(1);
    run(0);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    scheduler.request(); expect(request).toHaveBeenCalledTimes(2);
  });
  it("cancels a pending frame and ignores events after unmount", () => {
    let run!: FrameRequestCallback;
    const request = vi.fn((callback: FrameRequestCallback) => { run = callback; return 7; });
    const cancel = vi.fn(); const commit = vi.fn();
    const scheduler = createMapFrameScheduler(commit, request, cancel);
    scheduler.request(); scheduler.dispose(); scheduler.request(); run(0);
    expect(cancel).toHaveBeenCalledWith(7);
    expect(request).toHaveBeenCalledTimes(1); expect(commit).not.toHaveBeenCalled();
  });
});

function setup(initial = 10, synchronous = false) {
  vi.useFakeTimers();
  let actual = initial;
  let commanded = initial;
  const apply = vi.fn<(zoom: number, anchor: string | undefined) => void>((zoom) => {
    commanded = zoom;
    if (synchronous) { actual = zoom; queue.zoomStart(); queue.zoomEnd(); }
  });
  const schedule = vi.fn();
  const queue = createMapZoomQueue<string>({ getZoom: () => actual, getMinZoom: () => 2, getMaxZoom: () => 19, apply, schedule });
  const finish = () => { actual = commanded; queue.zoomEnd(); queue.flush(); };
  const pulse = (delta: number, anchor = "cursor") => { queue.wheel(delta, anchor); vi.advanceTimersByTime(40); queue.flush(); };
  return { queue, apply, schedule, finish, pulse, get actual() { return actual; } };
}

describe("map zoom input queue", () => {
  it("retains later batches and latest anchor while a command awaits its first animation frame", () => {
    const state = setup();
    state.pulse(15, "first");
    expect(state.apply).toHaveBeenLastCalledWith(10.25, "first");
    expect(state.queue.busy).toBe(true);
    state.pulse(15, "second"); state.pulse(15, "third");
    expect(state.apply).toHaveBeenCalledTimes(1);
    state.finish(); expect(state.apply).toHaveBeenLastCalledWith(10.75, "third");
    state.finish(); expect(state.actual).toBe(10.75); expect(state.queue.busy).toBe(false);
  });
  it("batches reverse input inside 40ms without manufacturing a step", () => {
    const state = setup();
    state.queue.wheel(15, "a"); vi.advanceTimersByTime(20); state.queue.wheel(-15, "b");
    vi.advanceTimersByTime(20); state.queue.flush();
    expect(state.apply).not.toHaveBeenCalled();
    state.pulse(15); state.pulse(-15); state.finish();
    expect(state.apply).toHaveBeenLastCalledWith(10, "cursor");
    state.finish(); expect(state.actual).toBe(10);
  });
  it("clamps each queued target and discards accumulated input at either boundary", () => {
    const state = setup(18.75);
    state.pulse(15); state.pulse(4000); state.pulse(4000); state.pulse(-15);
    state.finish(); expect(state.apply).toHaveBeenLastCalledWith(18.75, "cursor");
    state.finish();
    const low = setup(2);
    low.pulse(-4000); expect(low.apply).not.toHaveBeenCalled();
    low.pulse(15); expect(low.apply).toHaveBeenLastCalledWith(2.25, "cursor");
  });
  it("handles synchronous reduced-motion zoomend and equal-target no-ops without locking", () => {
    const state = setup(19, true);
    state.pulse(15); expect(state.queue.busy).toBe(false);
    state.pulse(-15); expect(state.actual).toBe(18.75); expect(state.queue.busy).toBe(false);
    state.pulse(-15); expect(state.actual).toBe(18.5);
  });
  it("retains repeated zoom button clicks while preserving direction changes", () => {
    const state = setup();
    state.queue.increment(1); state.queue.flush();
    state.queue.increment(1); state.queue.increment(1); state.queue.increment(-1); state.queue.flush();
    expect(state.apply).toHaveBeenCalledTimes(1);
    state.finish(); expect(state.apply).toHaveBeenLastCalledWith(12, undefined);
  });
  it("does not lose an uncommitted wheel batch when a zoom control is activated", () => {
    const state = setup();
    state.queue.wheel(15, "cursor"); state.queue.increment(1); state.queue.flush();
    expect(state.apply).toHaveBeenLastCalledWith(11.25, undefined);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("snaps a fractional target before detecting a no-op, avoiding a missing zoomend deadlock", () => {
    const state = setup(10.25);
    state.queue.zoomTo(10.26, "center"); state.queue.flush();
    expect(state.apply).not.toHaveBeenCalled(); expect(state.queue.busy).toBe(false);
    state.queue.increment(0.25); state.queue.flush();
    expect(state.apply).toHaveBeenLastCalledWith(10.5, undefined);
  });
  it("external navigation cancels queued wheel batches and applies only the latest view after zoomend", () => {
    const state = setup(); const oldView = vi.fn(); const newView = vi.fn();
    state.pulse(15); state.pulse(15); state.queue.wheel(15, "stale");
    state.queue.replaceView(oldView); state.queue.replaceView(newView);
    vi.runAllTimers(); state.queue.flush();
    expect(newView).not.toHaveBeenCalled();
    state.finish(); expect(oldView).not.toHaveBeenCalled(); expect(newView).toHaveBeenCalledTimes(1);
    expect(state.apply).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps an external view ahead of an old cluster activation", () => {
    const state = setup(); const overview = vi.fn();
    state.pulse(15); state.queue.replaceView(overview);
    state.queue.zoomTo(12, "stale-cluster"); state.queue.flush();
    state.finish();
    expect(overview).toHaveBeenCalledTimes(1);
    expect(state.apply).toHaveBeenCalledTimes(1);
  });
  it("cleans timers, queued views and animation callbacks on disposal", () => {
    const state = setup(); const view = vi.fn();
    state.queue.wheel(15, "cursor"); state.queue.dispose();
    expect(vi.getTimerCount()).toBe(0);
    state.queue.zoomEnd(); state.queue.replaceView(view); state.queue.increment(1); state.queue.flush();
    vi.runAllTimers(); expect(view).not.toHaveBeenCalled(); expect(state.apply).not.toHaveBeenCalled();
  });
});
