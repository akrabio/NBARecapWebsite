import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REPLAY_CACHE_MAX,
  READY_TTL_MS,
  UNAVAILABLE_TTL_MS,
  isAbortError,
  loadReplay,
  normalizeEspnId,
  peekReplay,
  replayCacheKey,
  resetReplayCache,
} from "@/utils/replay-api";
import { REPLAY_SCHEMA_VERSION } from "@/lib/replay/types";

const body = (id, status = "ready") => ({
  schemaVersion: REPLAY_SCHEMA_VERSION,
  builderVersion: 1,
  status,
  espnGameId: String(id),
  capabilities: [],
  warnings: [],
  reasons: status === "unavailable" ? ["game_not_final"] : [],
  replay:
    status === "unavailable"
      ? null
      : {
          teams: { home: { id: "1" }, away: { id: "2" } },
          events: [],
          state: { initial: {}, patches: [] },
          timeline: { durationSec: 90, segments: [] },
        },
});

// Controllable fetch: each call returns a deferred the test resolves.
function mockFetch() {
  const calls = [];
  const fn = vi.fn((url, { signal } = {}) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    signal?.addEventListener("abort", () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      reject(e);
    });
    const call = {
      url,
      signal,
      promise,
      respond: (status, json) =>
        resolve({ status, ok: status >= 200 && status < 300, json: async () => json }),
      fail: () => reject(new TypeError("network down")),
    };
    calls.push(call);
    return promise;
  });
  fn.calls = calls;
  return fn;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let fetchMock;
beforeEach(() => {
  resetReplayCache();
  fetchMock = mockFetch();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("replay client loader", () => {
  it("keys the cache by id and schema version", () => {
    expect(replayCacheKey("401810791")).toBe(`401810791:v${REPLAY_SCHEMA_VERSION}`);
    expect(normalizeEspnId(401810791)).toBe("401810791");
    expect(normalizeEspnId("abc")).toBeNull();
  });

  it("makes no request for a missing or invalid id", async () => {
    for (const id of [null, undefined, "", "65f0c0ffee", "../x", "1234567890123"]) {
      await expect(loadReplay(id)).resolves.toEqual({ state: "unavailable", data: null, reasons: ["no_espn_id"] });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent requests for one game and caches success", async () => {
    const a = loadReplay("401810791");
    const b = loadReplay("401810791");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.calls[0].url).toBe("/api/replay/401810791");
    fetchMock.calls[0].respond(200, body("401810791"));
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.state).toBe("ready");
    expect(rb).toBe(ra);
    // Repeat open: served from cache
    await expect(loadReplay("401810791")).resolves.toBe(ra);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps out-of-order completions on their own keys", async () => {
    const first = loadReplay("1");
    const second = loadReplay("2");
    fetchMock.calls[1].respond(200, body("2", "limited"));
    fetchMock.calls[0].respond(200, body("1"));
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.data.espnGameId).toBe("1");
    expect(r1.state).toBe("ready");
    expect(r2.data.espnGameId).toBe("2");
    expect(r2.state).toBe("limited");
    expect(peekReplay("1")).toBe(r1);
    expect(peekReplay("2")).toBe(r2);
  });

  it("rejects a body for a different game (no cross-game population)", async () => {
    const p = loadReplay("1");
    fetchMock.calls[0].respond(200, body("2"));
    await expect(p).rejects.toMatchObject({ code: "bad_response" });
    expect(peekReplay("1")).toBeNull();
  });

  it("does not cache failures and retries after an error", async () => {
    const p = loadReplay("7");
    fetchMock.calls[0].respond(502, { error: "upstream" });
    await expect(p).rejects.toMatchObject({ status: 502, code: "upstream" });
    expect(peekReplay("7")).toBeNull();

    const again = loadReplay("7");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.calls[1].respond(200, body("7"));
    await expect(again).resolves.toMatchObject({ state: "ready" });
  });

  it("does not cache network errors, 4xx or malformed bodies", async () => {
    const cases = [
      (c) => c.fail(),
      (c) => c.respond(400, {}),
      (c) => c.respond(404, {}),
      (c) => c.respond(504, {}),
      (c) => c.respond(200, { ...body("9"), schemaVersion: 999 }),
      (c) => c.respond(200, { ...body("9"), replay: { teams: {} } }),
    ];
    for (const [i, act] of cases.entries()) {
      const p = loadReplay("9");
      act(fetchMock.calls[i]);
      await expect(p).rejects.toBeTruthy();
      expect(peekReplay("9")).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(cases.length);
  });

  it("caches an unavailable 200 only briefly", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const p = loadReplay("5");
    fetchMock.calls[0].respond(200, body("5", "unavailable"));
    const r = await p;
    expect(r.state).toBe("unavailable");
    expect(r.data.replay).toBeNull();
    expect(peekReplay("5")).toBe(r);
    vi.setSystemTime(Date.now() + UNAVAILABLE_TTL_MS + 1);
    expect(peekReplay("5")).toBeNull();
  });

  it("expires ready results after the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const p = loadReplay("6");
    fetchMock.calls[0].respond(200, body("6"));
    await p;
    vi.setSystemTime(Date.now() + READY_TTL_MS - 1);
    expect(peekReplay("6")).not.toBeNull();
    vi.setSystemTime(Date.now() + 2);
    expect(peekReplay("6")).toBeNull();
    loadReplay("6");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used game beyond the bound", async () => {
    const ids = Array.from({ length: REPLAY_CACHE_MAX }, (_, i) => String(100 + i));
    for (const [i, id] of ids.entries()) {
      const p = loadReplay(id);
      fetchMock.calls[i].respond(200, body(id));
      await p;
    }
    await loadReplay(ids[0]); // touch → most recent
    const extra = loadReplay("999");
    fetchMock.calls.at(-1).respond(200, body("999"));
    await extra;
    expect(peekReplay(ids[0])).not.toBeNull();
    expect(peekReplay(ids[1])).toBeNull(); // oldest untouched evicted
    expect(peekReplay("999")).not.toBeNull();
  });

  it("one consumer aborting does not cancel the shared fetch for others", async () => {
    const ac = new AbortController();
    const a = loadReplay("11", { signal: ac.signal });
    const b = loadReplay("11");
    ac.abort();
    await expect(a).rejects.toSatisfy(isAbortError);
    expect(fetchMock.calls[0].signal.aborted).toBe(false);
    fetchMock.calls[0].respond(200, body("11"));
    await expect(b).resolves.toMatchObject({ state: "ready" });
    expect(peekReplay("11")).not.toBeNull();
  });

  it("aborts the shared fetch when the last consumer leaves; a new consumer refetches", async () => {
    const a1 = new AbortController();
    const a2 = new AbortController();
    const a = loadReplay("12", { signal: a1.signal });
    const b = loadReplay("12", { signal: a2.signal });
    a1.abort();
    expect(fetchMock.calls[0].signal.aborted).toBe(false);
    a2.abort();
    expect(fetchMock.calls[0].signal.aborted).toBe(true);
    await expect(a).rejects.toSatisfy(isAbortError);
    await expect(b).rejects.toSatisfy(isAbortError);
    await flush();
    expect(peekReplay("12")).toBeNull();

    const c = loadReplay("12");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.calls[1].respond(200, body("12"));
    await expect(c).resolves.toMatchObject({ state: "ready" });
  });

  it("rejects immediately for an already-aborted signal without fetching", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(loadReplay("13", { signal: ac.signal })).rejects.toSatisfy(isAbortError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
