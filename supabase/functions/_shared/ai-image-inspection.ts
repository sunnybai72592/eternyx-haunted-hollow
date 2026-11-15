/**
 * Bounded image-header inspection for uploaded AI generation inputs.
 *
 * This reads container/header metadata only. It is not a full decoder,
 * malware scanner, or content moderation system.
 */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
  readonly format: "jpeg" | "png" | "webp";
}
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 20_000_000;

function fail(): never {
  throw new Error("invalid_image_dimensions");
}
function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function ascii(b: Uint8Array, o: number, s: string): boolean {
  if (o + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
  return true;
}
function checked(width: number, height: number, format: ImageDimensions["format"]): ImageDimensions {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 ||
      width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS) fail();
  return { width, height, format };
}
function jpeg(b: Uint8Array): ImageDimensions {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) fail();
  let p = 2;
  while (p < b.length) {
    if (b[p] !== 0xff) fail();
    while (p < b.length && b[p] === 0xff) p++;
    if (p >= b.length) fail();
    const marker = b[p++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (p + 2 > b.length) fail();
    const length = u16be(b, p);
    if (length < 2 || p + length > b.length) fail();
    const isSof = [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker);
    if (isSof) {
      if (length < 8) fail();
      return checked(u16be(b, p + 5), u16be(b, p + 3), "jpeg");
    }
    p += length;
  }
  return fail();
}
function png(b: Uint8Array): ImageDimensions {
  if (b.length < 24 || !ascii(b, 12, "IHDR") || u32be(b, 8) !== 13) fail();
  return checked(
    ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0,
    ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0,
    "png",
  );
}
function webp(b: Uint8Array): ImageDimensions {
  if (b.length < 30 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) fail();
  const riffEnd = u32le(b, 4) + 8;
  if (riffEnd > b.length || riffEnd < 20) fail();
  const chunk = ascii(b, 12, "VP8X") ? "VP8X" :
    ascii(b, 12, "VP8L") ? "VP8L" :
    ascii(b, 12, "VP8 ") ? "VP8 " : "";
  if (!chunk) fail();
  const chunkSize = u32le(b, 16);
  if (chunkSize + 20 > riffEnd) fail();
  if (chunk === "VP8X") {
    if (chunkSize < 10) fail();
    return checked(u24le(b, 24) + 1, u24le(b, 27) + 1, "webp");
  }
  if (chunk === "VP8L") {
    if (chunkSize < 5 || b[20] !== 0x2f) fail();
    const w = 1 + b[21] + ((b[22] & 0x3f) << 8);
    const h = 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 0x0f) << 10);
    return checked(w, h, "webp");
  }
  if (chunkSize < 10 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) fail();
  return checked(((b[27] & 0x3f) << 8) | b[26], ((b[29] & 0x3f) << 8) | b[28], "webp");
}
export function inspectImageDimensions(bytes: Uint8Array, contentType: string): ImageDimensions {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return fail();
  if (contentType === "image/jpeg") return jpeg(bytes);
  if (contentType === "image/png") return png(bytes);
  if (contentType === "image/webp") return webp(bytes);
  return fail();
}
