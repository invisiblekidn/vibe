import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffName } from '../src/bot';

const GROUP = -1003997176062;
const env = (over: Record<string, unknown> = {}) =>
  ({ TG_BOT_TOKEN: 't', TG_STAFF_CHAT_ID: String(GROUP), TG_STAFF: '111:Aleks (@In0Kid)', LOCATION_ID: 'vibe', ...over }) as any;

function fakeTelegram(status: Record<number, string>) {
  const calls: any[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const s = status[body.user_id];
    return new Response(JSON.stringify(s ? { ok: true, result: { status: s, is_member: s === 'restricted' } } : { ok: false, description: 'user not found' }));
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('кто управляет заказами из группы', () => {
  it('сотрудник из списка — по имени из списка, без запроса в Telegram', async () => {
    const calls = fakeTelegram({});
    expect(await staffName(env(), { id: 111, first_name: 'X' })).toBe('Aleks (@In0Kid)');
    expect(calls).toHaveLength(0);
  });

  it('админ и участник группы, которых нет в списке, тоже могут', async () => {
    fakeTelegram({ 2051729982: 'administrator', 222: 'member', 333: 'creator' });
    expect(await staffName(env(), { id: 2051729982, first_name: 'Alex', username: 'Chef_amv' })).toBe('Alex');
    expect(await staffName(env(), { id: 222, username: 'cook' })).toBe('@cook');
    expect(await staffName(env(), { id: 333, first_name: 'Анна', last_name: 'К.' })).toBe('Анна К.');
  });

  it('вышедший из группы, исключённый и чужой — не могут', async () => {
    fakeTelegram({ 401: 'left', 402: 'kicked' });
    expect(await staffName(env(), { id: 401, first_name: 'L' })).toBeNull();
    expect(await staffName(env(), { id: 402, first_name: 'K' })).toBeNull();
    expect(await staffName(env(), { id: 403, first_name: 'N' })).toBeNull();
    expect(await staffName(env(), { id: 404, is_bot: true })).toBeNull();
  });

  it('без группы сотрудников никто, кроме списка', async () => {
    fakeTelegram({ 501: 'administrator' });
    expect(await staffName(env({ TG_STAFF_CHAT_ID: undefined }), { id: 501, first_name: 'A' })).toBeNull();
  });
});
