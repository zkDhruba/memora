import { randomBytes, createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

export function newId(): string {
  return uuidv7();
}

/** Opaque session / email token (URL-safe). */
export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Mask IPv4 to /24 or IPv6 to roughly /48. */
export function maskIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const cleaned = ip.replace(/^::ffff:/, "");
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts.length !== 4) return cleaned;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  const parts = cleaned.split(":");
  return `${parts.slice(0, 3).join(":")}::`;
}
