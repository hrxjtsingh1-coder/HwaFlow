import { describe, expect, it } from "vitest";

import { missingTranslationKeys } from "./coverage";

describe("missingTranslationKeys", () => {
  it("reports blocks the model did not translate", () => {
    expect(
      missingTranslationKeys(
        [{ panelId: "p", blocks: [{ index: 0 }, { index: 1 }] }],
        [{ panelId: "p", index: 0 }]
      )
    ).toEqual(["p:1"]);
  });

  it("is empty when every requested block came back", () => {
    expect(
      missingTranslationKeys(
        [
          { panelId: "p1", blocks: [{ index: 0 }, { index: 1 }] },
          { panelId: "p2", blocks: [{ index: 0 }] },
        ],
        [
          { panelId: "p1", index: 0 },
          { panelId: "p1", index: 1 },
          { panelId: "p2", index: 0 },
        ]
      )
    ).toEqual([]);
  });

  it("reports a panel that came back empty", () => {
    expect(
      missingTranslationKeys(
        [
          { panelId: "p1", blocks: [{ index: 0 }] },
          { panelId: "p2", blocks: [{ index: 0 }] },
        ],
        [{ panelId: "p1", index: 0 }]
      )
    ).toEqual(["p2:0"]);
  });

  it("does not treat an index from another panel as coverage", () => {
    expect(
      missingTranslationKeys(
        [{ panelId: "p1", blocks: [{ index: 0 }] }],
        [{ panelId: "p2", index: 0 }]
      )
    ).toEqual(["p1:0"]);
  });
});
