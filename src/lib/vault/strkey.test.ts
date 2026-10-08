/**
 * Strkey tests.
 *
 * The module under test re-implements Stellar's strkey encoding to avoid
 * bundling the SDK into form validation. These tests pin it against the
 * reference implementation (`StrKey` from `@stellar/stellar-sdk`) so the two can
 * never silently diverge.
 */

import { Buffer } from "node:buffer";

import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  crc16XModem,
  encodeEd25519PublicKey,
  isValidContractId,
  isValidEd25519PublicKey,
  STRKEY_VERSION,
} from "./strkey";

function bytes(length: number, fill = 0): Buffer {
  const out = Buffer.alloc(length);
  for (let i = 0; i < length; i += 1) out[i] = (i * 31 + fill) & 0xff;
  return out;
}

describe("crc16XModem", () => {
  it("matches the canonical CRC-16/XMODEM check value", () => {
    // "123456789" → 0x31C3 for poly 0x1021, init 0x0000.
    expect(crc16XModem(new TextEncoder().encode("123456789"))).toBe(0x31c3);
  });

  it("returns 0 for empty input", () => {
    expect(crc16XModem(new Uint8Array(0))).toBe(0);
  });
});

describe("base32", () => {
  it("round-trips every byte length up to 40", () => {
    for (let length = 1; length <= 40; length += 1) {
      const input = bytes(length, length);
      const decoded = base32Decode(base32Encode(input));
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded as Uint8Array)).toEqual(Array.from(input));
    }
  });

  it("uses the RFC 4648 alphabet with no padding", () => {
    expect(base32Encode(new Uint8Array(0))).toBe("");
    expect(base32Encode(new TextEncoder().encode("f"))).toBe("MY");
    expect(base32Encode(new TextEncoder().encode("fo"))).toBe("MZXQ");
  });

  it("rejects malformed input", () => {
    expect(base32Decode("")).toBeNull();
    // 1, 3 and 6 are impossible base32 lengths.
    expect(base32Decode("A")).toBeNull();
    expect(base32Decode("ABC")).toBeNull();
    expect(base32Decode("ABCDEF")).toBeNull();
    expect(base32Decode("AB0D")).toBeNull(); // 0 is not in the alphabet
    expect(base32Decode("ab")).toBeNull(); // lowercase is not valid
  });

  it("rejects non-zero trailing padding bits", () => {
    // "MZ" decodes to one byte (0x66) plus a byte of leftover bits.
    expect(base32Decode("MZ")).toBeNull();
    expect(base32Decode("MY")).not.toBeNull();
  });
});

describe("encodeEd25519PublicKey", () => {
  it("agrees with the Stellar SDK for arbitrary payloads", () => {
    for (let seed = 0; seed < 16; seed += 1) {
      const payload = bytes(32, seed);
      expect(encodeEd25519PublicKey(payload)).toBe(StrKey.encodeEd25519PublicKey(payload));
    }
  });

  it("produces addresses that start with G and validate", () => {
    const address = encodeEd25519PublicKey(bytes(32, 5));
    expect(address.startsWith("G")).toBe(true);
    expect(isValidEd25519PublicKey(address)).toBe(true);
  });

  it("throws unless the payload is exactly 32 bytes", () => {
    expect(() => encodeEd25519PublicKey(bytes(31))).toThrow(/32 bytes/);
    expect(() => encodeEd25519PublicKey(bytes(33))).toThrow(/32 bytes/);
  });
});

describe("isValidEd25519PublicKey", () => {
  it("accepts SDK-encoded account ids", () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const address = StrKey.encodeEd25519PublicKey(bytes(32, seed));
      expect(isValidEd25519PublicKey(address)).toBe(true);
    }
  });

  it("agrees with the SDK on a batch of addresses", () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const address = StrKey.encodeEd25519PublicKey(bytes(32, seed));
      expect(isValidEd25519PublicKey(address)).toBe(StrKey.isValidEd25519PublicKey(address));
      expect(isValidEd25519PublicKey(address.slice(0, -1) + "A")).toBe(
        StrKey.isValidEd25519PublicKey(address.slice(0, -1) + "A"),
      );
    }
  });

  it("rejects a contract id, a seed and malformed values", () => {
    const contractId = StrKey.encodeContract(bytes(32, 9));
    expect(isValidEd25519PublicKey(contractId)).toBe(false);
    expect(isValidEd25519PublicKey("")).toBe(false);
    expect(isValidEd25519PublicKey("GABC")).toBe(false);
    expect(isValidEd25519PublicKey("not-an-address")).toBe(false);
  });

  it("tolerates surrounding whitespace but not a tampered checksum", () => {
    const address = encodeEd25519PublicKey(bytes(32, 3));
    expect(isValidEd25519PublicKey(`  ${address}  `)).toBe(true);

    const tampered = `${address.slice(0, -1)}${address.endsWith("A") ? "B" : "A"}`;
    expect(isValidEd25519PublicKey(tampered)).toBe(false);
  });
});

describe("isValidContractId", () => {
  it("accepts SDK-encoded contract ids", () => {
    const contractId = StrKey.encodeContract(bytes(32, 9));
    expect(contractId.startsWith("C")).toBe(true);
    expect(isValidContractId(contractId)).toBe(true);
    expect(isValidContractId(contractId)).toBe(StrKey.isValidContract(contractId));
  });

  it("rejects account ids and tampered payloads", () => {
    const account = encodeEd25519PublicKey(bytes(32, 3));
    expect(isValidContractId(account)).toBe(false);
    expect(isValidContractId("")).toBe(false);

    const contractId = StrKey.encodeContract(bytes(32, 9));
    const tampered = `${contractId.slice(0, -1)}${contractId.endsWith("A") ? "B" : "A"}`;
    expect(isValidContractId(tampered)).toBe(false);
  });
});

describe("STRKEY_VERSION", () => {
  it("matches the protocol version bytes", () => {
    expect(STRKEY_VERSION.ed25519PublicKey).toBe(6 << 3);
    expect(STRKEY_VERSION.contract).toBe(2 << 3);
  });
});
