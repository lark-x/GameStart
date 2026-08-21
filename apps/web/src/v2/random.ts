/**
 * 生成 UUID，兼容非安全上下文。
 *
 * `crypto.randomUUID` 只在安全上下文（HTTPS 或 localhost）中可用；通过局域网
 * IP 访问的 HTTP 页面会缺失该方法，此时退回到 `crypto.getRandomValues` 生成
 * v4 UUID，最后再退回非加密伪随机。返回值仅用作本地幂等键 / 实体 ID，不用于安全场景。
 */
export function randomUuid(): string {
  const cryptoObject = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  if (cryptoObject !== undefined && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  if (cryptoObject !== undefined && typeof cryptoObject.getRandomValues === "function") {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
