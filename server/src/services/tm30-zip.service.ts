const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_STORED_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeUint16(output: Uint8Array, offset: number, value: number): void {
  output[offset] = value & 0xff;
  output[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(output: Uint8Array, offset: number, value: number): void {
  output[offset] = value & 0xff;
  output[offset + 1] = (value >>> 8) & 0xff;
  output[offset + 2] = (value >>> 16) & 0xff;
  output[offset + 3] = (value >>> 24) & 0xff;
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(view, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("TM30 template is not a valid XLSX zip file.");
}

export async function readZipEntries(input: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, cursor) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error("TM30 template central directory is invalid.");
    }

    const compressionMethod = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const fileNameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const name = bytesToString(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));

    if (readUint32(view, localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error(`TM30 template local header is invalid for ${name}.`);
    }
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);

    if (compressionMethod === ZIP_STORED_METHOD) {
      entries.push({ name, data: new Uint8Array(compressed) });
    } else if (compressionMethod === ZIP_DEFLATE_METHOD) {
      entries.push({ name, data: await inflateRaw(compressed) });
    } else {
      throw new Error(`TM30 template uses unsupported zip compression method ${compressionMethod}.`);
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function textEntry(entries: ZipEntry[], name: string): string {
  const entry = entries.find((item) => item.name === name);
  if (!entry) throw new Error(`TM30 template is missing ${name}.`);
  return bytesToString(entry.data);
}

export function updateTextEntry(entries: ZipEntry[], name: string, value: string): ZipEntry[] {
  return entries.map((entry) => (entry.name === name ? { name, data: stringToBytes(value) } : entry));
}

export function writeStoredZip(entries: ZipEntry[]): Uint8Array {
  const encodedNames = entries.map((entry) => stringToBytes(entry.name));
  const localOffsets: number[] = [];
  const localSize = entries.reduce((total, entry, index) => total + 30 + encodedNames[index]!.byteLength + entry.data.byteLength, 0);
  const centralSize = entries.reduce((total, _entry, index) => total + 46 + encodedNames[index]!.byteLength, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  let cursor = 0;

  entries.forEach((entry, index) => {
    const name = encodedNames[index]!;
    const crc = crc32(entry.data);
    localOffsets[index] = cursor;
    writeUint32(output, cursor, ZIP_LOCAL_FILE_HEADER);
    writeUint16(output, cursor + 4, ZIP_VERSION_NEEDED);
    writeUint16(output, cursor + 6, 0x0800);
    writeUint16(output, cursor + 8, ZIP_STORED_METHOD);
    writeUint16(output, cursor + 10, 0);
    writeUint16(output, cursor + 12, 0);
    writeUint32(output, cursor + 14, crc);
    writeUint32(output, cursor + 18, entry.data.byteLength);
    writeUint32(output, cursor + 22, entry.data.byteLength);
    writeUint16(output, cursor + 26, name.byteLength);
    writeUint16(output, cursor + 28, 0);
    output.set(name, cursor + 30);
    output.set(entry.data, cursor + 30 + name.byteLength);
    cursor += 30 + name.byteLength + entry.data.byteLength;
  });

  const centralDirectoryOffset = cursor;
  entries.forEach((entry, index) => {
    const name = encodedNames[index]!;
    const crc = crc32(entry.data);
    writeUint32(output, cursor, ZIP_CENTRAL_DIRECTORY_HEADER);
    writeUint16(output, cursor + 4, ZIP_VERSION_NEEDED);
    writeUint16(output, cursor + 6, ZIP_VERSION_NEEDED);
    writeUint16(output, cursor + 8, 0x0800);
    writeUint16(output, cursor + 10, ZIP_STORED_METHOD);
    writeUint16(output, cursor + 12, 0);
    writeUint16(output, cursor + 14, 0);
    writeUint32(output, cursor + 16, crc);
    writeUint32(output, cursor + 20, entry.data.byteLength);
    writeUint32(output, cursor + 24, entry.data.byteLength);
    writeUint16(output, cursor + 28, name.byteLength);
    writeUint16(output, cursor + 30, 0);
    writeUint16(output, cursor + 32, 0);
    writeUint16(output, cursor + 34, 0);
    writeUint16(output, cursor + 36, 0);
    writeUint32(output, cursor + 38, 0);
    writeUint32(output, cursor + 42, localOffsets[index]!);
    output.set(name, cursor + 46);
    cursor += 46 + name.byteLength;
  });

  const centralDirectorySize = cursor - centralDirectoryOffset;
  writeUint32(output, cursor, ZIP_END_OF_CENTRAL_DIRECTORY);
  writeUint16(output, cursor + 4, 0);
  writeUint16(output, cursor + 6, 0);
  writeUint16(output, cursor + 8, entries.length);
  writeUint16(output, cursor + 10, entries.length);
  writeUint32(output, cursor + 12, centralDirectorySize);
  writeUint32(output, cursor + 16, centralDirectoryOffset);
  writeUint16(output, cursor + 20, 0);

  return output;
}
