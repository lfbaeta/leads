import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const ALGORITHM = "scrypt";
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) {
    throw new Error("A senha deve possuir ao menos 10 caracteres.");
  }

  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;

  return [
    ALGORITHM,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [algorithm, saltEncoded, hashEncoded] = storedHash.split("$");

  if (
    algorithm !== ALGORITHM ||
    !saltEncoded ||
    !hashEncoded
  ) {
    return false;
  }

  const salt = Buffer.from(saltEncoded, "base64url");
  const stored = Buffer.from(hashEncoded, "base64url");

  if (stored.length !== KEY_LENGTH) {
    return false;
  }

  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;

  return timingSafeEqual(stored, derived);
}
