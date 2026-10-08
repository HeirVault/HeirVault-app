/**
 * Stellar strkey validation.
 *
 * Implements exactly the encoding the Stellar protocol uses for account ids
 * (G…), contract ids (C…), seed keys (S…) and so on:
 *
 *   base32(RFC 4648, no padding) of [versionByte ‖ payload ‖ crc16-XModem LE]
 *
 * It is implemented here — instead of pulling the full Stellar SDK into form
 * validation — so client bundles stay small and validation is cheap enough to
 * run on every keystroke. Correctness is pinned by unit tests that compare the
 * result against `StrKey` from `@stellar/stellar-sdk`.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Version bytes (already shifted left by 3), as used by the protocol. */
export const STRKEY_VERSION = {
  /** Ed25519 public key — account id, starts with `G`. */
  ed25519PublicKey: 6 << 3,
  /** Soroban contract id, starts with `C`. */
  contract: 2 << 3,
} as const;

const DECODE_TABLE = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let index = 0; index < BASE32_ALPHABET.length; index += 1) {
    table[BASE32_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

/** Decode a base32 string (no padding). Returns `null` on malformed input. */
export function base32Decode(input: string): Uint8Array | null {
  if (typeof input !== "string" || input.length === 0) return null;
  if (input.length % 8 === 1 || input.length % 8 === 3 || input.length % 8 === 6) return null;

  const bytes = new Uint8Array(Math.floor((input.length * 5) / 8));
  let buffer = 0;
  let bitsLeft = 0;
  let byteIndex = 0;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code > 127) return null;
    const value = DECODE_TABLE[code];
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bytes[byteIndex] = (buffer >>> (bitsLeft - 8)) & 0xff;
      byteIndex += 1;
      bitsLeft -= 8;
    }
  }

  // Any leftover bits must be zero padding.
  if (bitsLeft > 0 && (buffer & ((1 << bitsLeft) - 1)) !== 0) return null;

  return bytes;
}

/** Encode bytes as base32 (RFC 4648 alphabet, no padding). */
export function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bitsLeft = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bitsLeft - 5)) & 31];
      bitsLeft -= 5;
    }
  }
  if (bitsLeft > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bitsLeft)) & 31];
  }
  return output;
}

/** CRC16-XModem (poly 0x1021, init 0x0000) — the checksum Stellar uses. */
export function crc16XModem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** Verify a strkey of an expected version and payload length. */
function isValidStrKey(value: string, version: number, payloadLength: number): boolean {
  const decoded = base32Decode(value);
  if (!decoded) return false;
  if (decoded.length !== 1 + payloadLength + 2) return false;
  if (decoded[0] !== version) return false;

  const checksum = crc16XModem(decoded.subarray(0, decoded.length - 2));
  const expectedLow = checksum & 0xff;
  const expectedHigh = (checksum >> 8) & 0xff;

  return (
    decoded[decoded.length - 2] === expectedLow && decoded[decoded.length - 1] === expectedHigh
  );
}

/** True for a valid Stellar account id (`G…`, ed25519). */
export function isValidEd25519PublicKey(value: string): boolean {
  return isValidStrKey((value ?? "").trim(), STRKEY_VERSION.ed25519PublicKey, 32);
}

/** True for a valid Soroban contract id (`C…`). */
export function isValidContractId(value: string): boolean {
  return isValidStrKey((value ?? "").trim(), STRKEY_VERSION.contract, 32);
}

/**
 * Encode a 32-byte ed25519 public key as a Stellar account id (`G…`).
 * Used to derive deterministic, format-valid addresses for development fixtures.
 */
export function encodeEd25519PublicKey(payload: Uint8Array): string {
  if (payload.length !== 32) {
    throw new Error(`An ed25519 public key must be 32 bytes, received ${payload.length}.`);
  }
  const data = new Uint8Array(33);
  data[0] = STRKEY_VERSION.ed25519PublicKey;
  data.set(payload, 1);

  const checksum = crc16XModem(data);
  const encoded = new Uint8Array(35);
  encoded.set(data);
  encoded[33] = checksum & 0xff;
  encoded[34] = (checksum >> 8) & 0xff;
  return base32Encode(encoded);
}
