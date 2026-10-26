import { describe, expect, it } from "vitest";

import { renderObjectPath } from "./engine-renders";

const pageId = "3f7c1a52-9a6b-4c2b-8a51-0f8f2f0e9d11";

describe("renderObjectPath", () => {
  it("keeps the group/chapter prefix the bucket policies authorise on", () => {
    expect(renderObjectPath(`group-1/chapter-2/0001.webp`, pageId)).toBe(
      `group-1/chapter-2/${pageId}.png`
    );
  });

  it("uses the page id so a re-upload cannot orphan the previous render", () => {
    const before = renderObjectPath("g/c/0001.webp", pageId);
    const after = renderObjectPath("g/c/renamed.webp", pageId);
    expect(before).toBe(after);
  });

  it("tolerates a leading slash and repeated separators", () => {
    expect(renderObjectPath("/g/c/0001.webp", pageId)).toBe(`g/c/${pageId}.png`);
  });

  it("falls back to a bare file name when there is no directory", () => {
    expect(renderObjectPath("0001.webp", pageId)).toBe(`${pageId}.png`);
  });

  it("never returns a path outside the bucket root", () => {
    expect(renderObjectPath("   ", pageId)).toBe(`${pageId}.png`);
  });
});
