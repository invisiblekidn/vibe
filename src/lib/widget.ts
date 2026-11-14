// Живая карточка заказа в личном чате с гостем (HTML-виджет Telegram, Bot API 10.4).
// Код карточки задаётся один раз при отправке: шаги, состав заказа и подписи на языке гостя.
// Дальше бот меняет только «состояние» (chat_data) — текущий шаг, время, ревизию —
// и Telegram перерисовывает карточку на месте, без нового сообщения и без уведомления.
import { guestStatus, type GuestStatus, type OrderState } from './status';
import { escHtml, fmtVnd, slotText, type Lang, type OrderForText } from './telegram';

/** Кому показывать карточку вместо обычных сообщений: off — никому, staff — только сотрудникам из TG_STAFF, all — всем гостям. */
export type WidgetMode = 'off' | 'staff' | 'all';
export const widgetMode = (v: string | undefined): WidgetMode => (v === 'all' || v === 'off' ? v : 'staff');

type Step = [GuestStatus, string];

const L: Record<Lang, any> = {
  ru: {
    accepted: 'Заказ принят', checking: 'Оплата проверяется', paidOk: 'Оплата подтверждена', cooking: 'Готовим',
    ready: { pickup: 'Готов', visit: 'Готов', delivery: 'Курьер в пути', table: 'Готов' },
    done: { pickup: 'Выдан', visit: 'Подан', delivery: 'Доставлен', table: 'Подан' },
    n: {
      awaiting_payment: 'Оплатите по QR в окне заказа и нажмите «Я оплатил»',
      payment_checking: 'Администратор сверяет поступление денег',
      confirmed: 'Передаём заказ на кухню',
      cooking: 'Повар уже готовит ваш заказ',
      ready: { pickup: 'Можно забирать на кассе, назовите номер {n}', visit: 'Стол готов, ждём вас. Назовите номер {n}', delivery: 'Курьер уже едет к вам', table: 'Скоро принесём' },
      completed: 'Приятного аппетита! Будем рады видеть вас снова',
    },
    cx: ['Заказ отменён', 'Если это ошибка, напишите сюда, мы ответим'],
    order: 'Заказ', total: 'Итого', paid: 'Я оплатил', sending: 'Отправляем…', err: 'Не отправилось, попробуйте ещё раз', upd: 'обновлено', more: 'и ещё {n}',
  },
  vi: {
    accepted: 'Đã nhận đơn', checking: 'Đang kiểm tra thanh toán', paidOk: 'Đã xác nhận thanh toán', cooking: 'Đang nấu',
    ready: { pickup: 'Đã sẵn sàng', visit: 'Đã sẵn sàng', delivery: 'Shipper đang giao', table: 'Đã sẵn sàng' },
    done: { pickup: 'Đã giao', visit: 'Đã phục vụ', delivery: 'Đã giao', table: 'Đã phục vụ' },
    n: {
      awaiting_payment: 'Thanh toán bằng mã QR trong trang đơn hàng và bấm «Tôi đã thanh toán»',
      payment_checking: 'Quản lý đang kiểm tra tiền về',
      confirmed: 'Đơn đang được chuyển vào bếp',
      cooking: 'Đầu bếp đang nấu đơn của bạn',
      ready: { pickup: 'Mời bạn nhận tại quầy, hãy đọc số {n}', visit: 'Bàn đã sẵn sàng, chúng tôi đang chờ bạn. Hãy đọc số {n}', delivery: 'Shipper đang trên đường đến', table: 'Sắp mang ra' },
      completed: 'Chúc bạn ngon miệng! Mong được đón bạn lần sau',
    },
    cx: ['Đơn đã bị hủy', 'Nếu có nhầm lẫn, hãy nhắn vào đây'],
    order: 'Đơn', total: 'Tổng', paid: 'Tôi đã thanh toán', sending: 'Đang gửi…', err: 'Chưa gửi được, thử lại nhé', upd: 'cập nhật', more: 'và {n} món khác',
  },
  en: {
    accepted: 'Order received', checking: 'Checking payment', paidOk: 'Payment confirmed', cooking: 'Cooking',
    ready: { pickup: 'Ready', visit: 'Ready', delivery: 'Courier on the way', table: 'Ready' },
    done: { pickup: 'Picked up', visit: 'Served', delivery: 'Delivered', table: 'Served' },
    n: {
      awaiting_payment: 'Pay with the QR code on the order page and tap “I have paid”',
      payment_checking: 'The manager is checking the transfer',
      confirmed: 'Sending your order to the kitchen',
      cooking: 'The chef is cooking your order',
      ready: { pickup: 'Pick it up at the counter, say number {n}', visit: 'Your table is ready. Say number {n}', delivery: 'The courier is on the way', table: 'Coming to your table' },
      completed: 'Enjoy your meal! We hope to see you again',
    },
    cx: ['Order cancelled', 'If this is a mistake, write here and we will reply'],
    order: 'Order', total: 'Total', paid: 'I have paid', sending: 'Sending…', err: 'Not sent, please try again', upd: 'updated', more: 'and {n} more',
  },
};

/** Шаги, которые увидит гость. Без предоплаты по QR шагов оплаты нет. */
export function widgetSteps(o: Pick<OrderForText, 'type' | 'payment_method'>, lang: Lang): Step[] {
  const t = L[lang];
  const qr = o.payment_method === 'qr';
  const steps: Step[] = qr
    ? [['awaiting_payment', t.accepted], ['payment_checking', t.checking], ['confirmed', t.paidOk]]
    : [['confirmed', t.accepted]];
  steps.push(['cooking', t.cooking], ['ready', t.ready[o.type] || t.ready.pickup], ['completed', t.done[o.type] || t.done.pickup]);
  return steps;
}

/** Состояние карточки: текущий шаг, время обновления (местное) и ревизия, чтобы старое не перекрывало новое. */
export function widgetState(o: OrderState & { updated_at?: string | null }, tzOffsetMin = 420): string {
  const at = Date.parse(o.updated_at || '') || Date.now();
  const d = new Date(at + tzOffsetMin * 60_000);
  const t = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return JSON.stringify({ k: guestStatus(o), t, r: Math.floor(at / 1000) });
}

/** Подпись под карточкой: видна в списке чатов, в уведомлении и в старых приложениях без виджетов. */
export function widgetCaption(o: OrderForText & OrderState, lang: Lang): string {
  const k = guestStatus(o);
  const t = L[lang];
  const head = `${t.order} №${o.id}`;
  if (k === 'cancelled') return `${head} · ${t.cx[0]}`;
  const step = widgetSteps(o, lang).find((s) => s[0] === k);
  return `${head} · ${step ? step[1] : ''}`;
}

const CSS = `body{margin:0;padding:12px 14px max(10px,env(safe-area-inset-bottom));--g:light-dark(#3f7a4f,#8fcb9c);color-scheme:light dark}
.h{color:var(--tg-theme-hint-color);font-size:.85em}
#st{font-size:1.25em;font-weight:700;margin:2px 0 0}
#nt{margin:2px 0 10px;color:var(--tg-theme-subtitle-text-color)}
ol{list-style:none;margin:0 0 10px;padding:0}
li{position:relative;padding:0 0 9px 26px;color:var(--tg-theme-hint-color)}
li:before{content:"";position:absolute;left:7px;top:14px;bottom:-2px;width:2px;background:var(--tg-theme-section-separator-color)}
li:last-child:before{display:none}
li i{position:absolute;left:2px;top:3px;width:12px;height:12px;border-radius:50%;box-sizing:border-box;border:2px solid var(--tg-theme-section-separator-color);background:var(--tg-theme-bg-color)}
li.d{color:var(--tg-theme-text-color)}li.d i{background:var(--g);border-color:var(--g)}li.d:before{background:var(--g)}
li.c{color:var(--tg-theme-text-color);font-weight:600}li.c i{border-color:var(--g);animation:p 1.6s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 var(--g)}100%{box-shadow:0 0 0 7px transparent}}
@media (prefers-reduced-motion:reduce){li.c i{animation:none}}
.cx #st{color:var(--tg-theme-destructive-text-color)}.cx li{text-decoration:line-through}
.it{border-top:1px solid var(--tg-theme-section-separator-color);padding-top:8px;font-size:.92em}
.tot{display:flex;justify-content:space-between;font-weight:700;margin-top:4px}
#pay{width:100%;margin-top:10px}#msg{margin-top:4px}`;

const JS = `const W=window.TelegramWidget,$=i=>document.getElementById(i);let S=null,R=0;
const P=s=>{try{return JSON.parse(s)}catch(e){return null}};
function set(s){if(s&&(s.r||0)>=R){const was=S&&S.k;S=s;R=s.r||0;if(W&&was&&was!==s.k&&s.k==='ready')try{W.HapticFeedback.notificationOccurred('success')}catch(e){}}draw()}
function draw(){const s=S||{k:L.s[0][0]},x=s.k==='cancelled',i=L.s.findIndex(a=>a[0]===s.k);
document.body.className=x?'cx':'';$('st').textContent=x?L.cx[0]:(L.s[i]||L.s[0])[1];$('nt').textContent=x?L.cx[1]:L.n[s.k]||'';
$('ls').innerHTML=L.s.map((a,j)=>'<li class="'+(x?'':j<i||s.k==='completed'?'d':j==i?'c':'')+'"><i></i>'+a[1]+'</li>').join('');
$('pay').hidden=!(L.q&&s.k==='awaiting_payment');$('up').textContent=s.t?L.u+' '+s.t:''}
$('pay').onclick=()=>{if(!W)return;$('msg').textContent=L.w;$('pay').disabled=true;
W.request('paid').then(a=>{$('msg').textContent='';set(P(a.result))},()=>{$('msg').textContent=L.e}).finally(()=>{$('pay').disabled=false})};
if(W)W.onEvent('chatDataChanged',()=>set(P(W.chatData)));set(P(W&&W.chatData));`;

function noteFor(o: Pick<OrderForText, 'type' | 'id'>, lang: Lang, k: string): string {
  const v = L[lang].n[k];
  if (!v) return '';
  return (typeof v === 'string' ? v : v[o.type] || v.pickup).replace('{n}', String(o.id));
}

/**
 * Запасной вариант той же карточки — обычное сообщение, которое бот редактирует на месте.
 * Работает во всех приложениях Telegram уже сейчас; используется, пока Telegram не разрешил боту виджеты.
 */
export function statusCardText(o: OrderForText & OrderState & { updated_at?: string | null }, lang: Lang, today?: string, tzOffsetMin = 420): string {
  const t = L[lang];
  const st = JSON.parse(widgetState(o, tzOffsetMin)) as { k: GuestStatus; t: string };
  const steps = widgetSteps(o, lang);
  const cx = st.k === 'cancelled';
  const i = steps.findIndex((x) => x[0] === st.k);
  const done = st.k === 'completed';
  const head = `<b>VIBE · ${t.order} №${o.id}</b>${o.type === 'table' ? '' : ` · ${escHtml(slotText(o.slot, today, lang))}`}`;
  const title = cx ? `✖️ <b>${t.cx[0]}</b>\n${t.cx[1]}` : `${done ? '✅' : st.k === 'ready' ? '🍽' : '⏳'} <b>${steps[i]?.[1] ?? ''}</b>\n${noteFor(o, lang, st.k)}`;
  const list = steps
    .map(([, label], j) => (cx ? `▫️ <s>${label}</s>` : j < i || done ? `✅ ${label}` : j === i ? `👉 <b>${label}</b>` : `▫️ ${label}`))
    .join('\n');
  const shown = o.items.slice(0, 8).map((x) => `${x.qty} × ${escHtml(x.name)}`);
  const more = o.items.length - shown.length;
  const items = shown.join(', ') + (more > 0 ? ` ${t.more.replace('{n}', String(more))}` : '');
  return [head, '', title, '', list, '', items, `${t.total}: <b>${fmtVnd(o.total)}</b>`, `<i>${t.upd} ${st.t}</i>`].join('\n');
}

/** Кнопка «Я оплатил» под карточкой — пока заказ ждёт оплаты по QR. */
export const paidButtonText = (lang: Lang) => L[lang].paid;

/** HTML карточки. Всё, что не меняется (шаги, подписи, состав), «запекается» на языке гостя. */
export function widgetHtml(o: OrderForText, lang: Lang, today?: string): string {
  const t = L[lang];
  const steps = widgetSteps(o, lang);
  const notes: Record<string, string> = {};
  for (const [k] of steps) notes[k] = noteFor(o, lang, k);
  const data = { s: steps, n: notes, cx: t.cx, q: o.payment_method === 'qr', u: t.upd, w: t.sending, e: t.err };
  const when = o.type === 'table' ? '' : ` · ${escHtml(slotText(o.slot, today, lang))}`;
  // Длинный заказ не раздувает карточку: первые 6 позиций, остальное — числом.
  const shown = o.items.slice(0, 6).map((i) => `${i.qty} × ${escHtml(i.name)}`);
  const more = o.items.length - shown.length;
  const items = shown.join(', ') + (more > 0 ? ` ${t.more.replace('{n}', String(more))}` : '');
  // JSON внутри <script>: «<» экранируем, чтобы название блюда не закрыло тег.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    `<style>${CSS}</style>` +
    `<div class="h">VIBE · ${t.order} №${o.id}${when}</div><div id="st"></div><div id="nt"></div><ol id="ls"></ol>` +
    `<div class="it">${items}<div class="tot"><span>${t.total}</span><span>${fmtVnd(o.total)}</span></div></div>` +
    `<button id="pay" hidden>${t.paid}</button><div id="msg" class="h"></div><div id="up" class="h"></div>` +
    `<script>const L=${json};${JS}</script>`
  );
}
