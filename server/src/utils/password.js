import crypto from "node:crypto";

export function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const incoming = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(incoming, "hex"), Buffer.from(hash, "hex"));
}
