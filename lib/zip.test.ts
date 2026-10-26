import { describe, expect, it } from "vitest";

import { buildZip, crc32 } from "./zip";

const encode = (value: string) => new TextEncoder().encode(value);
const stamp = new Date(2026, 9, 26, 12, 0, 0);

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("buildZip", () => {
  const zip = buildZip(
    [
      { name: "001.png", data: encode("first") },
      { name: "002.png", data: encode("second page") },
    ],
    stamp
  );
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  it("starts with a local file header and ends with the central directory", () => {
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });

  it("records the entry count and central directory offset", () => {
    const eocd = zip.length - 22;
    expect(view.getUint16(eocd + 8, true)).toBe(2);
    expect(view.getUint16(eocd + 10, true)).toBe(2);

    const centralOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);

    const centralSize = view.getUint32(eocd + 12, true);
    expect(centralOffset + centralSize).toBe(eocd);
  });

  it("stores the payload verbatim with its real CRC and size", () => {
    const payload = encode("first");
    expect(view.getUint16(8, true)).toBe(0); // method: stored
    expect(view.getUint32(14, true)).toBe(crc32(payload));
    expect(view.getUint32(18, true)).toBe(payload.length);
    expect(view.getUint32(22, true)).toBe(payload.length);

    const nameLength = view.getUint16(26, true);
    expect(nameLength).toBe("001.png".length);
    const dataStart = 30 + nameLength;
    expect(new TextDecoder().decode(zip.slice(dataStart, dataStart + payload.length))).toBe("first");
  });

  it("keeps both names findable for unzip tools", () => {
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("001.png");
    expect(text).toContain("002.png");
  });

  it("handles an empty archive", () => {
    const empty = buildZip([], stamp);
    const emptyView = new DataView(empty.buffer);
    expect(empty.length).toBe(22);
    expect(emptyView.getUint16(8, true)).toBe(0);
  });
});
