import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// 임시 관리자 계정(비밀번호 로그인)용 해시. 저장 형식: scrypt$<N>$<salt hex>$<hash hex>
// 비밀번호 원문은 어디에도 저장하지 않고, 해시는 관리자 연동 설정의 암호화 파일에 둔다.
const N = 16384;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N });
  return `scrypt$${N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !n || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
