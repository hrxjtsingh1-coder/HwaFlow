/**
 * Minimal ZIP writer — stored (uncompressed) entries only.
 *
 * The only thing this repo needs it for is handing a typesetter the finished
 * chapter in one file. PNGs are already deflated, so compression would cost CPU
 * and buy nothing; stored entries keep the writer small enough to audit in one
 * sitting and let it run on any Node version.
 *
 * No dependency: `zip` here means the container format, not the library.
 */

export type ZipEntry = { name: string; data: Uint8Array };

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const VERSION = 20; // 2.0 — the floor for the stored method
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** MS-DOS packs the timestamp as two 16-bit words; seconds have 2s resolution. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function buildZip(
  entries: ZipEntry[],
  modified: Date = new Date()
): Uint8Array<ArrayBuffer> {
  const { time, date } = dosDateTime(modified);

  const names = entries.map((entry) => encoder.encode(entry.name));
  const localSize = entries.reduce(
    (total, entry, index) => total + LOCAL_HEADER_SIZE + names[index].length + entry.data.length,
    0
  );
  const centralSize = entries.reduce(
    (total, _entry, index) => total + CENTRAL_HEADER_SIZE + names[index].length,
    0
  );

  const output = new Uint8Array(localSize + centralSize + EOCD_SIZE);
  const view = new DataView(output.buffer);

  let offset = 0;
  const offsets: number[] = [];

  entries.forEach((entry, index) => {
    const name = names[index];
    offsets.push(offset);

    view.setUint32(offset, LOCAL_SIGNATURE, true);
    view.setUint16(offset + 4, VERSION, true);
    view.setUint16(offset + 6, 0, true); // flags
    view.setUint16(offset + 8, 0, true); // method: stored
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, crc32(entry.data), true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, name.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    output.set(name, offset + LOCAL_HEADER_SIZE);
    output.set(entry.data, offset + LOCAL_HEADER_SIZE + name.length);

    offset += LOCAL_HEADER_SIZE + name.length + entry.data.length;
  });

  const centralStart = offset;

  entries.forEach((entry, index) => {
    const name = names[index];

    view.setUint32(offset, CENTRAL_SIGNATURE, true);
    view.setUint16(offset + 4, VERSION, true); // version made by
    view.setUint16(offset + 6, VERSION, true); // version needed
    view.setUint16(offset + 8, 0, true); // flags
    view.setUint16(offset + 10, 0, true); // method
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, crc32(entry.data), true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, name.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk
    view.setUint16(offset + 36, 0, true); // internal attrs
    view.setUint32(offset + 38, 0, true); // external attrs
    view.setUint32(offset + 42, offsets[index], true);
    output.set(name, offset + CENTRAL_HEADER_SIZE);

    offset += CENTRAL_HEADER_SIZE + name.length;
  });

  view.setUint32(offset, EOCD_SIGNATURE, true);
  view.setUint16(offset + 4, 0, true); // this disk
  view.setUint16(offset + 6, 0, true); // disk with the central directory
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // comment length

  return output;
}
