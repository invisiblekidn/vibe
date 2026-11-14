import { describe, expect, it } from 'vitest';
import { statusCardText, widgetCaption, widgetHtml, widgetMode, widgetState, widgetSteps } from '../src/lib/widget';

const base: any = {
  id: 42, type: 'pickup', slot: '2026-11-14 12:30', status: 'new', payment_status: 'unpaid', payment_method: 'qr', total: 245000,
  guest_name: 'Анна', guest_phone: '+84', channel: 'telegram', updated_at: '2026-11-14T05:41:00Z',
  items: [{ name: 'Фо бо', qty: 2, options: [] }, { name: 'Сок <манго>', qty: 1, options: [] }],
};
const big: any = { ...base, items: Array.from({ length: 30 }, (_, i) => ({ name: `Очень длинное название блюда номер ${i} со сметаной`, qty: 2, options: [] })) };

describe('живая карточка заказа', () => {
  // Сжатие по умолчанию даёт чуть больше, чем zlib уровня 9 на сервере Telegram, — проверка с запасом.
  const deflated = async (s: string) => (await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()).byteLength;

  it('укладывается в лимиты Telegram на всех языках, даже для большого заказа', async () => {
    for (const lang of ['ru', 'vi', 'en'] as const) {
      for (const o of [base, big, { ...big, type: 'delivery' }]) {
        const html = widgetHtml(o, lang, '2026-11-14');
        expect(new TextEncoder().encode(html).length).toBeLessThan(32768);
        expect(await deflated(html)).toBeLessThan(4096);
      }
    }
  });

  it('экранирует названия блюд', () => {
    const html = widgetHtml(base, 'ru', '2026-11-14');
    expect(html).toContain('Сок &lt;манго&gt;');
    expect(html).not.toContain('<манго>');
  });

  it('шаги оплаты только для предоплаты по QR', () => {
    expect(widgetSteps(base, 'ru').map((s) => s[0])).toEqual(['awaiting_payment', 'payment_checking', 'confirmed', 'cooking', 'ready', 'completed']);
    expect(widgetSteps({ type: 'table', payment_method: 'bill' }, 'ru').map((s) => s[0])).toEqual(['confirmed', 'cooking', 'ready', 'completed']);
    expect(widgetSteps({ type: 'delivery', payment_method: 'qr' }, 'ru')[4][1]).toBe('Курьер в пути');
  });

  it('«гость сообщил об оплате» и «оплата подтверждена» — разные шаги', () => {
    const k = (o: any) => JSON.parse(widgetState(o)).k;
    expect(k({ ...base, payment_status: 'reported' })).toBe('payment_checking');
    expect(k({ ...base, payment_status: 'confirmed' })).toBe('confirmed');
    expect(k({ ...base, status: 'cancelled' })).toBe('cancelled');
    const st = JSON.parse(widgetState(base, 420));
    expect(st.t).toBe('12:41');
    expect(new TextEncoder().encode(widgetState(base)).length).toBeLessThan(1024);
  });

  it('подпись показывает текущий шаг', () => {
    expect(widgetCaption({ ...base, payment_status: 'reported' } as any, 'ru')).toBe('Заказ №42 · Оплата проверяется');
    expect(widgetCaption({ ...base, status: 'cooking', payment_status: 'confirmed' } as any, 'en')).toBe('Order №42 · Cooking');
  });

  it('по умолчанию карточка только у сотрудников', () => {
    expect(widgetMode(undefined)).toBe('staff');
    expect(widgetMode('all')).toBe('all');
    expect(widgetMode('off')).toBe('off');
  });

  it('запасная текстовая карточка: те же шаги, отметка текущего', () => {
    const txt = statusCardText({ ...base, payment_status: 'reported' }, 'ru', '2026-11-14', 420);
    expect(txt).toContain('✅ Заказ принят');
    expect(txt).toContain('👉 <b>Оплата проверяется</b>');
    expect(txt).toContain('▫️ Оплата подтверждена');
    expect(txt).toContain('Сок &lt;манго&gt;');
    expect(txt).toContain('обновлено 12:41');
    expect(statusCardText({ ...base, status: 'cancelled' }, 'en')).toContain('<s>Cooking</s>');
  });
});
