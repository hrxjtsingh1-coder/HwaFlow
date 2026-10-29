import { describe, expect, it } from "vitest";
import {
  limitUploadBatch,
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_PAGES,
  MAX_PAGE_BYTES,
  pageObjectName,
  PAGE_MIME_TYPE,
  remainingPages,
} from "./engine-limits";

describe("engine page budget", () => {
  it("caps a chapter at exactly 20 pages", () => {
    expect(MAX_CHAPTER_PAGES).toBe(20);
    expect(remainingPages(0)).toBe(20);
    expect(remainingPages(19)).toBe(1);
    expect(remainingPages(20)).toBe(0);
    expect(remainingPages(25)).toBe(0);
  });

  it("only accepts what fits the remaining slots", () => {
    const files = Array.from({ length: 8 }, (_, i) => ({
      name: `p${i}.png`,
      size: 1024,
    }));
    const result = limitUploadBatch(files, { pages: 15, bytes: 0 });
    expect(result.accepted).toBe(5);
    expect(result.reason).toMatch(/Only 5 more pages/);
    expect(result.reason).toMatch(/max 20/);
  });

  it("refuses everything when the chapter is already full", () => {
    const result = limitUploadBatch([{ name: "p.png", size: 10 }], {
      pages: 20,
      bytes: 1000,
    });
    expect(result.accepted).toBe(0);
    expect(result.reason).toMatch(/at most 20 pages/);
  });

  it("skips an oversized page but keeps the rest of the batch", () => {
    const result = limitUploadBatch(
      [
        { name: "ok.png", size: 1024 },
        { name: "huge.png", size: MAX_PAGE_BYTES + 1 },
        { name: "also-ok.png", size: 2048 },
      ],
      { pages: 0, bytes: 0 }
    );
    expect(result.accepted).toBe(2);
    expect(result.acceptedIndexes).toEqual([0, 2]);
    expect(result.reason).toMatch(/1 file is over/);
  });

  it("keeps a later valid page when an oversized file comes before the last open slot", () => {
    const result = limitUploadBatch(
      [
        { name: "too-large.png", size: MAX_PAGE_BYTES + 1 },
        { name: "valid.png", size: 1024 },
      ],
      { pages: MAX_CHAPTER_PAGES - 1, bytes: 0 }
    );
    expect(result.accepted).toBe(1);
    expect(result.acceptedIndexes).toEqual([1]);
    expect(result.reason).toMatch(/over 10\.0 MB/);
  });

  it("enforces the cumulative 80 MB chapter budget", () => {
    const result = limitUploadBatch([{ name: "p.png", size: 1024 }], {
      pages: 0,
      bytes: MAX_CHAPTER_BYTES - 100,
    });
    expect(result.accepted).toBe(0);
    expect(result.reason).toMatch(/80\.0 MB engine limit/);
  });

  it("accepts a full batch with no warning", () => {
    const result = limitUploadBatch(
      [
        { name: "a.png", size: 1024 },
        { name: "b.png", size: 2048 },
      ],
      { pages: 0, bytes: 0 }
    );
    expect(result).toEqual({ accepted: 2, acceptedIndexes: [0, 1], reason: null });
  });

  it("stores originals as PNG", () => {
    expect(PAGE_MIME_TYPE).toBe("image/png");
    expect(pageObjectName("abc")).toBe("abc.png");
  });
});
