import { expect, it } from "vitest";

import { RETRY_CEILING_MS, retryDelaysMs } from "./retry";

it("retries twice before giving up on a single load", () => {
  expect(retryDelaysMs()).toEqual([250, 1000]);
});

it("keeps the background re-arm bounded", () => {
  expect(RETRY_CEILING_MS).toBe(30_000);
});
