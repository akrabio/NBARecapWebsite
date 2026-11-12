import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tiny React stand-in (node env, no DOM): enough of useState/useEffect/
// useCallback to drive useReplayData through mount, re-render and unmount.
const react = vi.hoisted(() => {
  let current = null;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  function renderHook(hook, initialProps) {
    const inst = { slots: [], effects: [], props: initialProps, result: null, mounted: true };
    const render = () => {
      if (!inst.mounted) return;
      current = inst;
      inst.i = 0;
      inst.pending = [];
      inst.result = hook(inst.props);
      current = null;
      for (const { slot, fn } of inst.pending) {
        slot.cleanup?.();
        slot.cleanup = fn() || null;
      }
    };
    inst.render = render;
    render();
    return {
      get current() {
        return inst.result;
      },
      rerender(props = inst.props) {
        inst.props = props;
        render();
      },
      unmount() {
        inst.mounted = false;
        for (const slot of inst.slots) slot?.cleanup?.();
      },
    };
  }
  const slot = (init) => {
    const i = current.i++;
    if (!(i in current.slots)) current.slots[i] = init();
    return current.slots[i];
  };
  const mock = {
    useState(initial) {
      const inst = current;
      const s = slot(() => ({ value: typeof initial === "function" ? initial() : initial }));
      s.set ??= (next) => {
        const value = typeof next === "function" ? next(s.value) : next;
        if (Object.is(value, s.value)) return;
        s.value = value;
        inst.render();
      };
      return [s.value, s.set];
    },
    useEffect(fn, deps) {
      const s = slot(() => ({ deps: null, cleanup: null }));
      if (!sameDeps(s.deps, deps)) {
        s.deps = deps;
        current.pending.push({ slot: s, fn });
      }
    },
    useCallback(fn, deps) {
      const s = slot(() => ({ deps: null, fn }));
      if (!sameDeps(s.deps, deps)) Object.assign(s, { deps, fn });
      return s.fn;
    },
  };
  return { mock, renderHook };
});
vi.mock("react", () => react.mock);

const { READY_TTL_MS, resetReplayCache, useReplayData } = await import("@/utils/replay-api");
const { REPLAY_SCHEMA_VERSION } = await import("@/lib/replay/types");

const body = (id) => ({
  schemaVersion: REPLAY_SCHEMA_VERSION,
  builderVersion: 1,
  status: "ready",
  espnGameId: id,
  capabilities: [],
  warnings: [],
  reasons: [],
  replay: {
    teams: { home: { id: "1" }, away: { id: "2" } },
    events: [],
    state: { initial: {}, patches: [] },
    timeline: { durationSec: 90, segments: [] },
  },
});

let responses;
const fetchMock = vi.fn(async (url) => {
  const next = responses.shift();
  if (!next) throw new Error(`unexpected fetch ${url}`);
  return next();
});
const ok = (id) => () => ({ status: 200, ok: true, json: async () => body(id) });
const fail = () => ({ status: 502, ok: false, json: async () => ({}) });
const flush = () => new Promise((r) => setTimeout(r, 0));
const useHook = ({ id, enabled = true }) => useReplayData(id, { enabled });

beforeEach(() => {
  resetReplayCache();
  responses = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useReplayData", () => {
  it("is idle and fetches nothing until enabled", async () => {
    const h = react.renderHook(useHook, { id: "1", enabled: false });
    await flush();
    expect(h.current.state).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
    responses.push(ok("1"));
    h.rerender({ id: "1", enabled: true });
    expect(h.current.state).toBe("loading");
    await flush();
    expect(h.current.state).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports no_espn_id without fetching", async () => {
    const h = react.renderHook(useHook, { id: null });
    await flush();
    expect(h.current).toMatchObject({ state: "unavailable", reasons: ["no_espn_id"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a cache-hit replay loaded after the cache TTL expires", async () => {
    responses.push(ok("1"), ok("2"));
    const a = react.renderHook(useHook, { id: "1" });
    await flush();
    expect(a.current.state).toBe("ready");
    a.rerender({ id: "2" }); // go to B
    await flush();
    expect(a.current.data.espnGameId).toBe("2");
    a.rerender({ id: "1" }); // back to A: cache hit, no request
    expect(a.current.state).toBe("ready");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Remounted view hitting the cache, then TTL passes and it re-renders
    a.unmount();
    const b = react.renderHook(useHook, { id: "1" });
    await flush();
    expect(b.current.state).toBe("ready");
    vi.setSystemTime(Date.now() + READY_TTL_MS + 1000);
    b.rerender();
    b.rerender();
    expect(b.current.state).toBe("ready");
    expect(b.current.data.espnGameId).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows error, then retry refetches (failure not cached); retry is stable", async () => {
    responses.push(fail);
    const h = react.renderHook(useHook, { id: "3" });
    const retry = h.current.retry;
    await flush();
    expect(h.current.state).toBe("error");
    expect(h.current.retry).toBe(retry);
    responses.push(ok("3"));
    h.current.retry();
    expect(h.current.state).toBe("loading");
    await flush();
    expect(h.current.state).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never shows a late result for a previous game", async () => {
    let release;
    responses.push(() => new Promise((r) => (release = () => r(ok("4")()))), ok("5"));
    const h = react.renderHook(useHook, { id: "4" });
    h.rerender({ id: "5" });
    await flush();
    expect(h.current.data.espnGameId).toBe("5");
    release();
    await flush();
    expect(h.current.data.espnGameId).toBe("5");
  });
});
