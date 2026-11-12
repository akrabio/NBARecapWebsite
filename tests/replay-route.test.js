import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/replay/[gameId]/route";
import { BUILDER_VERSION } from "@/lib/replay/build";
import { REPLAY_CACHE, getReplayResponse } from "@/lib/replay/service";
import { REASON_CODES as R, REPLAY_SCHEMA_VERSION } from "@/lib/replay/types";

const rawFixture = (id) => readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8");
const RAW = { "401810062": rawFixture("401810062"), "401810791": rawFixture("401810791") };
const load = (id) => JSON.parse(RAW[id]);

// Planted secrets/HTML that must never reach a response body.
const SECRET = "sk_live_SECRET_TOKEN_123";
const UPSTREAM_DUMP = `{"code":500,"message":"Error invoking GET: http://sports.core.api.espn.pvt/v2/internal?apikey=${SECRET}"}`;
const ARTICLE_HTML = "<p>ARTICLE_BODY_MARKER <a href='x'>story</a></p>";

const withNews = (summary) => ({
  ...summary,
  news: { articles: [{ headline: "NEWS_HEADLINE_MARKER", story: ARTICLE_HTML }] },
  article: { story: ARTICLE_HTML, headline: "ARTICLE_HEADLINE_MARKER" },
  videos: [{ headline: "VIDEO_MARKER" }],
});

const unfinished = (summary) => {
  const s = structuredClone(summary);
  s.header.competitions[0].status = { type: { id: "2", name: "STATUS_IN_PROGRESS", state: "in", completed: false, description: "In Progress" } };
  return s;
};

function jsonResponse(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const call = (id) => GET(new Request(`http://localhost/api/replay/${id}`), { params: Promise.resolve({ gameId: id }) });

// Response text must not leak upstream dumps, secrets, stack traces or articles.
function expectClean(text) {
  for (const marker of [SECRET, "sports.core.api.espn.pvt", "Error invoking", "at Object.", "    at ", "node_modules", "ARTICLE_BODY_MARKER", "NEWS_HEADLINE_MARKER", "ARTICLE_HEADLINE_MARKER", "VIDEO_MARKER", "<p>", "<a "]) {
    expect(text).not.toContain(marker);
  }
}

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/replay/[gameId] (route + fetchEspnSummary, mocked fetch)", () => {
  it("rejects invalid IDs with 400 without fetching", async () => {
    for (const id of ["abc", "", "123abc", "1".repeat(13), "../summary", "507f1f77bcf86cd799439011", "https%3A%2F%2Fevil.example"]) {
      const res = await call(id);
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect((await res.json()).error).toBe("invalid_id");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches only the ESPN summary URL for the given numeric ID", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RAW["401810062"]));
    await call("401810062");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401810062");
  });

  it("serves a finished game as 200 with shared cache and version headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify(withNews(load("401810791")))));
    const res = await call("401810791");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(REPLAY_CACHE.success);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=\d+/);
    expect(res.headers.get("cache-control")).toMatch(/stale-while-revalidate=\d+/);
    expect(res.headers.get("x-replay-builder")).toBe(String(BUILDER_VERSION));
    expect(res.headers.get("x-replay-schema")).toBe(String(REPLAY_SCHEMA_VERSION));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const text = await res.text();
    expectClean(text);
    const body = JSON.parse(text);
    expect(body).toMatchObject({ status: "ready", espnGameId: "401810791", schemaVersion: REPLAY_SCHEMA_VERSION, builderVersion: BUILDER_VERSION });
    expect(body.replay.events.length).toBeGreaterThan(100);
    expect(Object.keys(body)).not.toContain("news");
  });

  it("serves a limited finished game as 200 with shared cache", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RAW["401810062"]));
    const res = await call("401810062");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(REPLAY_CACHE.success);
    const body = await res.json();
    expect(body.status).toBe("limited");
    expect(body.replay).not.toBeNull();
  });

  it("answers unknown events (ESPN 4xx) with 404, no-store, no upstream body", async () => {
    for (const status of [404, 400]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(UPSTREAM_DUMP, status));
      const res = await call("1");
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const text = await res.text();
      expectClean(text);
      expect(JSON.parse(text).error).toBe("not_found");
    }
  });

  it("answers ESPN 5xx with 502 and no upstream dump", async () => {
    fetchMock.mockResolvedValue(jsonResponse(UPSTREAM_DUMP, 503));
    const res = await call("401810062");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expectClean(text);
    expect(JSON.parse(text)).toEqual({ error: "upstream_failed", message: expect.any(String), schemaVersion: REPLAY_SCHEMA_VERSION, builderVersion: BUILDER_VERSION });
  });

  it("answers network errors and unparsable JSON with 502", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed: ${UPSTREAM_DUMP}`));
    let res = await call("401810062");
    expect(res.status).toBe(502);
    expectClean(await res.text());

    fetchMock.mockResolvedValueOnce(new Response(`<html>${SECRET}</html>`, { status: 200 }));
    res = await call("401810062");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expectClean(await res.text());
  });

  it("answers a stalled upstream with 504 after the timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));
    const pending = call("401810062");
    await vi.advanceTimersByTimeAsync(8001);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).error).toBe("upstream_timeout");
  });

  it("answers an unfinished game with 200 unavailable and a short, non-shared-for-long cache", async () => {
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify(unfinished(load("401810062")))));
    const res = await call("401810062");
    expect(res.status).toBe(200);
    const cc = res.headers.get("cache-control");
    expect(cc).toBe(REPLAY_CACHE.unavailable);
    expect(Number(cc.match(/s-maxage=(\d+)/)[1])).toBeLessThanOrEqual(60);
    expect(cc).not.toMatch(/stale-while-revalidate/);
    const body = await res.json();
    expect(body).toMatchObject({ status: "unavailable", replay: null, espnGameId: "401810062" });
    expect(body.reasons).toContain(R.GAME_NOT_FINAL);
  });
});

describe("getReplayResponse (injected fetchSummary)", () => {
  const svc = (id, summaryOrFn, opts = {}) =>
    getReplayResponse(id, { fetchSummary: typeof summaryOrFn === "function" ? summaryOrFn : async () => summaryOrFn, ...opts });

  it("malformed plays → 200 unavailable, short cache", async () => {
    for (const plays of ["garbage", null, [], [{ nonsense: true }, 42, null]]) {
      const res = await svc("401810062", { ...load("401810062"), plays });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("unavailable");
      expect(res.body.replay).toBeNull();
      expect(res.headers["Cache-Control"]).toBe(REPLAY_CACHE.unavailable);
    }
  });

  it("partially corrupted plays never yield a long-cached ready/limited result without validation", async () => {
    const s = load("401810062");
    s.plays = s.plays.map((p, i) => (i % 7 === 0 ? { ...p, clock: undefined, period: undefined, scoreValue: "x" } : p));
    const res = await svc("401810062", s);
    expect(res.status).toBe(200);
    expect(["unavailable", "limited"]).toContain(res.body.status);
    expect(res.headers["Cache-Control"]).toBe(res.body.status === "unavailable" ? REPLAY_CACHE.unavailable : REPLAY_CACHE.success);
  });

  it("missing probability → limited, no invented samples, shared cache", async () => {
    const s = load("401810791");
    delete s.winprobability;
    const res = await svc("401810791", s);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("limited");
    expect(res.body.replay.probability).toEqual([]);
    expect(res.headers["Cache-Control"]).toBe(REPLAY_CACHE.success);
  });

  it("build throwing → 500 no-store, generic body without the error message or stack", async () => {
    const res = await svc("401810062", load("401810062"), {
      build: () => {
        throw new Error(`boom ${SECRET}`);
      },
    });
    expect(res.status).toBe(500);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body.error).toBe("build_failed");
    expectClean(JSON.stringify(res.body));
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });

  it("source returning a different game → 502", async () => {
    const res = await svc("401810063", load("401810062"));
    expect(res.status).toBe(502);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("non-object summary → 502; null → 404", async () => {
    expect((await svc("401810062", "not json")).status).toBe(502);
    expect((await svc("401810062", [1, 2])).status).toBe(502);
    expect((await svc("401810062", null)).status).toBe(404);
  });

  it("custom timeout → 504", async () => {
    const res = await svc("401810062", () => new Promise((r) => setTimeout(() => r(load("401810062")), 200)), { timeoutMs: 10 });
    expect(res.status).toBe(504);
  });

  it("non-string / invalid IDs → 400", async () => {
    for (const id of [undefined, null, 401810062, ["401810062"], "4018 10062", "-1"]) {
      expect((await svc(id, load("401810062"))).status).toBe(400);
    }
  });

  it("every response carries version headers and no error is cached", async () => {
    const cases = await Promise.all([
      svc("abc", null),
      svc("1", null),
      svc("1", async () => {
        throw new Error("x");
      }),
      svc("401810062", load("401810062")),
    ]);
    for (const res of cases) {
      expect(res.headers["X-Replay-Builder"]).toBe(String(BUILDER_VERSION));
      expect(res.headers["X-Replay-Schema"]).toBe(String(REPLAY_SCHEMA_VERSION));
      if (res.status >= 400) expect(res.headers["Cache-Control"]).toBe("no-store");
    }
  });
});
