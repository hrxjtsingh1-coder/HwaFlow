import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeResponse = (status: number, body: string): Response =>
  ({ status, text: async () => body }) as unknown as Response;

let counter = 0;

function uniqueUrl(): string {
  // A distinct URL per test also busts the module's 60s success cache.
  counter += 1;
  return `https://engine-${counter}.example`;
}

describe("GET /api/health/engine", () => {
  beforeEach(() => {
    process.env.ENGINE_API_URL = uniqueUrl();
    process.env.ENGINE_WEB_TOKEN = "a-test-token";
    delete process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN;
    delete process.env.ENGINE_HEALTH_DEBUG;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses the zero-I/O kernel probe path and treats 404 as a pass", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeResponse(404, '{"error":"not_found"}')
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { GET } = await import("./route");

    const response = await GET(new Request("https://site.example/api/health/engine"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.probe.status).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/kernel/engine-health-probe");
    expect(fetchMock.mock.calls[0][0]).not.toContain("/v1/jobs/");
  });

  it("reports locked on 401 and never echoes the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(401, '{"error":"unauthorized"}')));
    vi.resetModules();
    const { GET } = await import("./route");

    const response = await GET(new Request("https://site.example/api/health/engine"));
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("a-test-token");
    const body = JSON.parse(text);
    expect(body.ok).toBe(false);
    expect(body.probe.status).toBe("locked");
  });

  it("retries a thrown fetch before giving up", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(fakeResponse(404, ""));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { GET } = await import("./route");

    const response = await GET(new Request("https://site.example/api/health/engine"));
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.ok).toBe(true);
    expect(body.probe.attempts).toBe(2);
  });

  it("production returns only {ok} unless the debug gate is supplied", async () => {
    const previous = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.ENGINE_HEALTH_DEBUG = "1";
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, "")));
    vi.resetModules();
    try {
      const { GET } = await import("./route");

      const plain = await GET(new Request("https://site.example/api/health/engine"));
      expect(plain.status).toBe(200);
      expect(await plain.json()).toEqual({ ok: true });

      const verbose = await GET(
        new Request("https://site.example/api/health/engine?verbose=1", {
          headers: { "x-engine-debug": "a-test-token" },
        })
      );
      const body = await verbose.json();
      expect(body.probe.status).toBe("ok");
      expect(JSON.stringify(body)).not.toContain("a-test-token");
    } finally {
      Object.assign(process.env, { NODE_ENV: previous });
      delete process.env.ENGINE_HEALTH_DEBUG;
    }
  });

  it("fails when a NEXT_PUBLIC_ copy of the token exists", async () => {
    process.env.NEXT_PUBLIC_ENGINE_WEB_TOKEN = "leaked";
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, "")));
    vi.resetModules();
    const { GET } = await import("./route");

    const response = await GET(new Request("https://site.example/api/health/engine"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.env.tokenLeakedIntoPublicEnv).toBe(true);
  });
});
