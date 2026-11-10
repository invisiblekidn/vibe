// Вход сотрудника на этапе 1: имя + общий PIN из секрета STAFF_PIN.
// Сессия — подписанная cookie. На этапе 3 заменим на личные учётные записи сотрудников.

const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const SESSION_COOKIE = 'vibe_staff';
const TTL_MS = 14 * 60 * 60 * 1000; // одна смена

export async function makeSession(secret: string, name: string, nowMs: number): Promise<string> {
  const payload = `${encodeURIComponent(name)}|${nowMs + TTL_MS}`;
  return `${payload}|${await hmac(secret, payload)}`;
}

export async function readSession(secret: string, cookie: string | undefined, nowMs: number): Promise<string | null> {
  if (!cookie) return null;
  const parts = cookie.split('|');
  if (parts.length !== 3) return null;
  const [name, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(secret, `${name}|${exp}`))) return null;
  if (Number(exp) < nowMs) return null;
  return decodeURIComponent(name);
}

export function pinMatches(expected: string | undefined, given: unknown): boolean {
  return typeof expected === 'string' && expected.length > 0 && typeof given === 'string' && safeEqual(expected, given);
}
