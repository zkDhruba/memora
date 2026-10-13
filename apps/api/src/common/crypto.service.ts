import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "../config/env";

/**
 * Application-layer AES-256-GCM for MFA seeds (APP_DATA_KEY).
 * Wire format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 *
 * Key material: base64-decoded 32-byte value, or SHA-256 of the env string
 * (so local passphrases of any length work).
 */
@Injectable()
export class CryptoService {
  private key(): Buffer {
    const raw = env.appDataKey();
    const fromB64 = Buffer.from(raw, "base64");
    if (fromB64.length === 32) return fromB64;
    return createHash("sha256").update(raw, "utf8").digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split(":");
    if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
      throw new Error("Invalid encrypted payload");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }
}
