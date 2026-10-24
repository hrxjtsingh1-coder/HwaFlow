import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dayKey, FocusTracker, useFocus } from "./focus-tracker";

function Probe() {
  const { todaySeconds, sessionSeconds, tracking } = useFocus();
  return (
    <span data-testid="out">{`${todaySeconds}/${sessionSeconds}/${tracking}`}</span>
  );
}

const out = () => screen.getByTestId("out").textContent;

/** Runs the seed request and the effects around it to completion. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function stubFetch(days: Array<{ day: string; seconds: number }> | null) {
  const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Promise.resolve(ok({ ok: true, total: 500 }));
    }
    return Promise.resolve(
      days ? ok({ days }) : ({ ok: false, json: async () => ({}) } as Response)
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("FocusTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resumes today's stored total", async () => {
    stubFetch([{ day: dayKey(), seconds: 90 }]);

    render(
      <FocusTracker>
        <Probe />
      </FocusTracker>
    );
    await settle();

    expect(out()).toBe("90/0/true");
  });

  it("counts a tick per second while the tab is focused", async () => {
    stubFetch([{ day: dayKey(), seconds: 10 }]);

    render(
      <FocusTracker>
        <Probe />
      </FocusTracker>
    );
    await settle();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(out()).toBe("13/3/true");
  });

  it("adopts the server total after a flush instead of counting twice", async () => {
    const fetchMock = stubFetch([{ day: dayKey(), seconds: 0 }]);

    render(
      <FocusTracker>
        <Probe />
      </FocusTracker>
    );
    await settle();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({
      day: dayKey(),
      seconds: 30,
    });
    expect(out()).toBe("500/30/true");
  });

  it("never counts for a signed-out visitor", async () => {
    stubFetch(null);

    render(
      <FocusTracker>
        <Probe />
      </FocusTracker>
    );
    await settle();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(out()).toBe("0/0/false");
  });
});
