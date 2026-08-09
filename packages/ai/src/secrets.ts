import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
}

export class SecretCipher {
  private readonly key: Buffer;

  public constructor(base64Key: string) {
    let key: Buffer;
    try {
      key = Buffer.from(base64Key, "base64");
    } catch {
      throw new TypeError("INTEGRATION_SECRET_KEY must be base64 encoded");
    }
    if (key.byteLength !== 32) {
      throw new TypeError("INTEGRATION_SECRET_KEY must decode to exactly 32 bytes");
    }
    this.key = key;
  }

  public encrypt(value: string): EncryptedSecret {
    if (value.trim().length === 0) throw new TypeError("secret must be non-empty");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([body, tag]).toString("base64"), iv: iv.toString("base64") };
  }

  public decrypt(secret: EncryptedSecret): string {
    let payload: Buffer;
    let iv: Buffer;
    try {
      payload = Buffer.from(secret.ciphertext, "base64");
      iv = Buffer.from(secret.iv, "base64");
    } catch {
      throw new TypeError("encrypted secret is malformed");
    }
    if (iv.byteLength !== 12 || payload.byteLength < 17) {
      throw new TypeError("encrypted secret is malformed");
    }
    try {
      const body = payload.subarray(0, -16);
      const tag = payload.subarray(-16);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      throw new TypeError("encrypted secret cannot be decrypted");
    }
  }
}
