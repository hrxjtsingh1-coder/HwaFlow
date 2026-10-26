import { describe, expect, it } from "vitest";

import { normaliseEngineRegions } from "./engine-regions";

const page = { width: 800, height: 1200 };

describe("normaliseEngineRegions", () => {
  it("passes fractional boxes through untouched", () => {
    const [block] = normaliseEngineRegions(
      [{ bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, textSource: "안녕", textTarget: "Hi" }],
      page
    );

    expect(block.bbox).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(block.sourceText).toBe("안녕");
    expect(block.baseTranslation).toBe("Hi");
    expect(block.finalText).toBe("Hi");
  });

  it("scales pixel boxes by the page size", () => {
    const [block] = normaliseEngineRegions(
      [{ bbox: { x: 80, y: 240, w: 400, h: 120 } }],
      page
    );

    expect(block.bbox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.1 });
  });

  it("accepts flat [x, y, w, h] arrays", () => {
    const [block] = normaliseEngineRegions([[80, 240, 400, 120]], page);
    expect(block.bbox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.1 });
  });

  it("accepts corner-pair boxes", () => {
    const [block] = normaliseEngineRegions(
      [{ bbox: { x1: 80, y1: 240, x2: 480, y2: 360 } }],
      page
    );
    expect(block.bbox).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.1 });
  });

  it("reads the alternative field spellings", () => {
    const [block] = normaliseEngineRegions(
      [{ text: "원문", translation: "Source", score: 92 }],
      page
    );

    expect(block.sourceText).toBe("원문");
    expect(block.finalText).toBe("Source");
    expect(block.confidence).toBe(0.92);
  });

  it("unwraps the common envelopes", () => {
    const wrapped = normaliseEngineRegions({ regions: [{ text: "a" }] }, page);
    const nested = normaliseEngineRegions({ pages: [{ regions: [{ text: "b" }] }] }, page);

    expect(wrapped).toHaveLength(1);
    expect(wrapped[0].sourceText).toBe("a");
    expect(nested).toHaveLength(1);
    expect(nested[0].sourceText).toBe("b");
  });

  it("moves duplicate indexes instead of colliding on upsert", () => {
    const blocks = normaliseEngineRegions(
      [
        { index: 0, text: "a" },
        { index: 0, text: "b" },
        { index: 0, text: "c" },
      ],
      page
    );

    expect(blocks.map((block) => block.index)).toEqual([0, 1, 2]);
  });

  it("keeps text when the box is degenerate", () => {
    const [block] = normaliseEngineRegions(
      [{ bbox: { x: 0, y: 0, w: 0, h: 0 }, text: "still here" }],
      page
    );

    expect(block.bbox).toBeNull();
    expect(block.sourceText).toBe("still here");
  });

  it("drops entries that carry neither text nor a usable box", () => {
    expect(normaliseEngineRegions([{}, null, 7, { bbox: { x: 1 } }], page)).toHaveLength(0);
  });

  it("survives payloads that are not regions at all", () => {
    expect(normaliseEngineRegions(null, page)).toHaveLength(0);
    expect(normaliseEngineRegions("nope", page)).toHaveLength(0);
    expect(normaliseEngineRegions({ error: "engine" }, page)).toHaveLength(0);
  });
});
