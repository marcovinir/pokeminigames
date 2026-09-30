import bcrypt from "bcryptjs";

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

/** bcrypt solo considera los primeros 72 bytes; el registro rechaza contraseñas más largas. */
export const MAX_PASSWORD_BYTES = 72;

export function createPasswordHasher(cost: number): PasswordHasher {
  return {
    hash: (plain) => bcrypt.hash(plain, cost),
    verify: (plain, hash) => bcrypt.compare(plain, hash),
  };
}
