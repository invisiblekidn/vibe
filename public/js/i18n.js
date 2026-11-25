// Три языка сайта гостя: русский (по умолчанию), вьетнамский, английский.
// Язык выбирается строкой RU · VI · EN над шапкой и запоминается на телефоне.
// Первый визит: ?lang= в ссылке → язык Telegram (в Mini App) → язык телефона → русский.

const LANGS = ['ru', 'vi', 'en'];
const LOCALE = { ru: 'ru-RU', vi: 'vi-VN', en: 'en-GB' };

const LANG = (() => {
  const ok = (v) => (LANGS.includes(v) ? v : null);
  // Панель сотрудника пока только на русском.
  if (document.documentElement.dataset.fixedLang) return document.documentElement.dataset.fixedLang;
  const fromUrl = ok(new URLSearchParams(location.search).get('lang'));
  if (fromUrl) {
    try { localStorage.setItem('vibe_lang', fromUrl); } catch { /* приватный режим */ }
    return fromUrl;
  }
  try {
    const saved = ok(localStorage.getItem('vibe_lang'));
    if (saved) return saved;
  } catch { /* приватный режим */ }
  const guess = (code) => {
    const c = String(code || '').toLowerCase().slice(0, 2);
    if (c === 'vi') return 'vi';
    if (c === 'en') return 'en';
    if (['ru', 'uk', 'be', 'kk'].includes(c)) return 'ru';
    return null;
  };
  // Mini App: язык из настроек Telegram (данные лежат в адресе после #).
  try {
    const raw = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');
    const user = raw && JSON.parse(new URLSearchParams(raw).get('user') || 'null');
    const tgLang = user && guess(user.language_code);
    if (tgLang) return tgLang;
  } catch { /* нет данных Telegram */ }
  for (const l of navigator.languages || [navigator.language]) {
    const g = guess(l);
    if (g) return g;
  }
  return 'ru';
})();
document.documentElement.lang = LANG;

const I18N = {
  // Общее
  langLabel: { ru: 'Язык', vi: 'Ngôn ngữ', en: 'Language' },
  menu: { ru: 'Меню', vi: 'Thực đơn', en: 'Menu' },
  staffLink: { ru: 'Для сотрудников', vi: 'Dành cho nhân viên', en: 'Staff' },
  close: { ru: 'Закрыть', vi: 'Đóng', en: 'Close' },
  less: { ru: 'Меньше', vi: 'Bớt', en: 'Less' },
  more: { ru: 'Больше', vi: 'Thêm', en: 'More' },
  total: { ru: 'Итого', vi: 'Tổng cộng', en: 'Total' },
  sum: { ru: 'Сумма', vi: 'Số tiền', en: 'Amount' },
  comment: { ru: 'Комментарий', vi: 'Ghi chú', en: 'Comment' },
  commentIs: { ru: 'Комментарий: {x}', vi: 'Ghi chú: {x}', en: 'Comment: {x}' },
  qrAlt: { ru: 'QR-код для оплаты', vi: 'Mã QR thanh toán', en: 'QR code for payment' },
  sending: { ru: 'Отправляем…', vi: 'Đang gửi…', en: 'Sending…' },
  noNetRetry: { ru: 'Нет связи, нажмите ещё раз', vi: 'Mất kết nối, bấm lại lần nữa', en: 'No connection, tap again' },
  failed: { ru: 'Не получилось', vi: 'Không thành công', en: 'Something went wrong' },
  orderNo: { ru: 'Заказ №{n}', vi: 'Đơn số {n}', en: 'Order #{n}' },

  // Типы заказа и время
  type_pickup: { ru: 'С собой', vi: 'Mang đi', en: 'Takeaway' },
  type_visit: { ru: 'К визиту', vi: 'Đặt trước khi đến', en: 'For your visit' },
  type_delivery: { ru: 'Доставка', vi: 'Giao hàng', en: 'Delivery' },
  type_table: { ru: 'В зале', vi: 'Tại bàn', en: 'At the table' },
  today: { ru: 'Сегодня', vi: 'Hôm nay', en: 'Today' },
  tomorrow: { ru: 'Завтра', vi: 'Ngày mai', en: 'Tomorrow' },
  slotAt: { ru: '{day} в {time}', vi: '{time}, {day}', en: '{day} at {time}' },

  // Главная
  metaTitle: { ru: 'VIBE — семейный ресторан в Нячанге', vi: 'VIBE — nhà hàng gia đình ở Nha Trang', en: 'VIBE — family restaurant in Nha Trang' },
  metaDesc: { ru: 'Семейный ресторан VIBE в Нячанге: домашняя кухня, детская зона и детское меню. Предзаказ с собой, к визиту и доставка по зданию «Наполеон».', vi: 'Nhà hàng gia đình VIBE ở Nha Trang: món ăn kiểu nhà làm, khu vui chơi và thực đơn cho trẻ em. Đặt món trước để mang đi, khi bạn đến hoặc giao trong tòa Napoleon.', en: 'VIBE family restaurant in Nha Trang: home-style food, a kids’ play area and kids’ menu. Order ahead for takeaway, for your visit or delivery within the Napoleon building.' },
  heroTitle: { ru: 'Домашняя кухня для всей семьи', vi: 'Món ăn nhà làm cho cả gia đình', en: 'Home cooking for the whole family' },
  heroText: { ru: 'Завтраки весь день, супы как у бабушки, детское меню и игровая зона, пока взрослые спокойно обедают.', vi: 'Bữa sáng cả ngày, súp như bà nấu, thực đơn trẻ em và khu vui chơi để người lớn thong thả dùng bữa.', en: 'Breakfast all day, soups like grandma’s, a kids’ menu and a play area while the grown-ups enjoy their meal.' },
  heroBtn: { ru: 'Заказать заранее', vi: 'Đặt món trước', en: 'Order ahead' },
  heroAlt: { ru: 'Большой завтрак VIBE', vi: 'Bữa sáng lớn VIBE', en: 'VIBE Big Breakfast' },
  factHours: { ru: 'Часы', vi: 'Giờ mở cửa', en: 'Hours' },
  factHoursVal: { ru: 'ежедневно {from}–{to}', vi: 'hằng ngày {from}–{to}', en: 'daily {from}–{to}' },
  factAddr: { ru: 'Адрес', vi: 'Địa chỉ', en: 'Address' },
  factPre: { ru: 'Предзаказ', vi: 'Đặt trước', en: 'Order ahead' },
  factPreVal: { ru: 'с собой, к визиту и доставка по «Наполеону», до 7 дней вперёд', vi: 'mang đi, khi bạn đến hoặc giao trong tòa Napoleon, trước tối đa 7 ngày', en: 'takeaway, for your visit or delivery in Napoleon, up to 7 days ahead' },
  menuSections: { ru: 'Разделы меню', vi: 'Danh mục thực đơn', en: 'Menu sections' },
  menuLoading: { ru: 'Загружаем меню…', vi: 'Đang tải thực đơn…', en: 'Loading the menu…' },
  menuFailed: { ru: 'Не удалось загрузить меню. Обновите страницу.', vi: 'Không tải được thực đơn. Vui lòng tải lại trang.', en: 'Could not load the menu. Please refresh the page.' },
  soldOutToday: { ru: 'На стопе', vi: 'Tạm hết', en: 'Unavailable' },
  remove: { ru: 'Убрать', vi: 'Bỏ', en: 'Remove' },
  stopBtn: { ru: 'Сейчас на стопе', vi: 'Hiện tạm hết', en: 'Unavailable right now' },
  stopLine: { ru: 'Сейчас заказать нельзя. Уберите из заказа.', vi: 'Hiện chưa đặt được. Vui lòng bỏ khỏi đơn.', en: 'Can’t be ordered right now. Please remove it.' },
  stopProblem: { ru: 'Сейчас на стопе: {names}. Уберите из заказа, чтобы оформить.', vi: 'Hiện tạm hết: {names}. Vui lòng bỏ khỏi đơn để đặt.', en: 'Unavailable right now: {names}. Remove to place the order.' },
  topHit: { ru: 'Главный хит', vi: 'Bán chạy nhất', en: 'Top hit' },
  hitsTitle: { ru: 'Хиты продаж', vi: 'Món bán chạy', en: 'Best sellers' },
  hitTag: { ru: 'Хит', vi: 'Bán chạy', en: 'Hit' },
  kidsTag: { ru: 'детское', vi: 'trẻ em', en: 'kids' },
  secAll: { ru: 'Все группы', vi: 'Tất cả nhóm', en: 'All groups' },
  priceFrom: { ru: 'от {p}', vi: 'từ {p}', en: 'from {p}' },
  dishOfDay: { ru: 'Хит продаж', vi: 'Món bán chạy', en: 'Best seller' },
  dodAdd: { ru: 'Добавить', vi: 'Thêm', en: 'Add' },
  chef: { ru: 'шеф', vi: 'bếp trưởng', en: 'chef' },
  visitOnly: { ru: 'только к визиту', vi: 'chỉ khi đến quán', en: 'for your visit only' },
  cartBar: { ru: 'Корзина · {n} · {sum}', vi: 'Giỏ hàng · {n} · {sum}', en: 'Cart · {n} · {sum}' },

  // Карточка блюда
  dishSoldToday: { ru: 'Блюдо сейчас на стопе: оно есть в меню, но заказать его пока нельзя.', vi: 'Món này hiện tạm hết: vẫn có trong thực đơn nhưng tạm thời chưa đặt được.', en: 'This dish is on the menu but unavailable right now.' },
  alcoholVisit: { ru: 'Алкоголь подаём только к вашему визиту в ресторан.', vi: 'Đồ uống có cồn chỉ phục vụ khi bạn đến nhà hàng.', en: 'Alcohol is served only when you visit the restaurant.' },
  optRequired: { ru: 'обязательно', vi: 'bắt buộc', en: 'required' },
  optUpTo: { ru: 'до {n}', vi: 'tối đa {n}', en: 'up to {n}' },
  optOptional: { ru: 'по желанию', vi: 'tùy chọn', en: 'optional' },
  addToCart: { ru: 'В корзину · {sum}', vi: 'Thêm vào giỏ · {sum}', en: 'Add to cart · {sum}' },
  choose: { ru: 'Выберите: {x}', vi: 'Vui lòng chọn: {x}', en: 'Please choose: {x}' },
  saveChoice: { ru: 'Сохранить · {sum}', vi: 'Lưu · {sum}', en: 'Save · {sum}' },
  // Строка корзины, где не выбран обязательный вариант
  needOption: { ru: 'Выберите: {x}', vi: 'Chọn: {x}', en: 'Choose: {x}' },
  pickOption: { ru: 'Выбрать', vi: 'Chọn', en: 'Choose' },
  changeOption: { ru: 'Изменить', vi: 'Sửa', en: 'Change' },
  optionProblem: { ru: 'Выберите вариант для: {names}. Без этого заказ не оформить.', vi: 'Hãy chọn lựa chọn cho: {names}. Chưa chọn thì không đặt được.', en: 'Choose an option for: {names}. The order can’t be placed without it.' },

  // Корзина и оформление
  yourOrder: { ru: 'Ваш заказ', vi: 'Đơn hàng của bạn', en: 'Your order' },
  soldOutPill: { ru: 'на стопе', vi: 'tạm hết', en: 'unavailable' },
  howGet: { ru: 'Как получить', vi: 'Cách nhận món', en: 'How to get it' },
  visitHint: { ru: 'Приготовим к вашему приходу, стол будет ждать. Минимум за 30 минут.', vi: 'Chúng tôi sẽ chuẩn bị sẵn khi bạn đến, bàn sẽ chờ bạn. Đặt trước ít nhất 30 phút.', en: 'We will have it ready when you arrive and keep a table for you. At least 30 minutes ahead.' },
  pickupHint: { ru: 'Упакуем к выбранному времени, заберёте в ресторане. Минимум за 30 минут.', vi: 'Chúng tôi đóng gói sẵn đúng giờ bạn chọn, bạn đến nhà hàng lấy. Đặt trước ít nhất 30 phút.', en: 'We pack it for the time you choose, you collect it at the restaurant. At least 30 minutes ahead.' },
  when: { ru: 'Когда', vi: 'Thời gian', en: 'When' },
  slotFull: { ru: 'занято', vi: 'đã kín', en: 'full' },
  slotSoon: { ru: 'не успеем', vi: 'không kịp', en: 'too soon' },
  slotLeft: { ru: 'осталось {n}', vi: 'còn {n}', en: '{n} left' },
  noSlots: { ru: 'На этот день свободного времени нет.', vi: 'Ngày này đã hết khung giờ trống.', en: 'No free time left on this day.' },
  slotsLoading: { ru: 'Загружаем время…', vi: 'Đang tải khung giờ…', en: 'Loading times…' },
  contacts: { ru: 'Контакты', vi: 'Thông tin liên hệ', en: 'Contact details' },
  name: { ru: 'Имя', vi: 'Tên', en: 'Name' },
  phone: { ru: 'Телефон', vi: 'Số điện thoại', en: 'Phone' },
  phoneOpt: { ru: 'Телефон (необязательно)', vi: 'Số điện thoại (không bắt buộc)', en: 'Phone (optional)' },
  phoneOptHint: { ru: 'Без телефона мы будем на связи в Telegram: после оформления нажмите «Получать статус в Telegram».', vi: 'Nếu không có số điện thoại, chúng tôi liên lạc qua Telegram: sau khi đặt, hãy bấm «Nhận trạng thái qua Telegram».', en: 'Without a phone we keep in touch on Telegram: after ordering, tap “Get updates in Telegram”.' },
  commentPh: { ru: 'Например: без лука, детский стульчик', vi: 'Ví dụ: không hành, cần ghế cho bé', en: 'For example: no onion, a high chair' },
  payHint: { ru: 'Оплата по QR-коду. После оформления покажем номер заказа и сумму. Готовить начнём, когда сотрудник увидит поступление денег.', vi: 'Thanh toán bằng mã QR. Sau khi đặt, chúng tôi hiển thị số đơn và số tiền. Bếp bắt đầu nấu khi nhân viên thấy tiền đã về.', en: 'Payment by QR code. After you order we show the order number and amount. We start cooking once staff see the money arrive.' },
  alcoholProblem: { ru: 'Алкоголь можно заказать только «к визиту». Выберите «К визиту» или уберите напиток.', vi: 'Đồ uống có cồn chỉ đặt được với «Đặt trước khi đến». Hãy chọn «Đặt trước khi đến» hoặc bỏ đồ uống.', en: 'Alcohol can only be ordered “For your visit”. Choose “For your visit” or remove the drink.' },
  soldProblem: { ru: 'Часть блюд закончилась на выбранный день: они отмечены ниже.', vi: 'Một số món đã hết vào ngày đã chọn: được đánh dấu bên dưới.', en: 'Some dishes are sold out on the chosen day: they are marked below.' },
  submitFor: { ru: 'Оформить на {when}', vi: 'Đặt cho {when}', en: 'Order for {when}' },
  chooseTime: { ru: 'Выберите время', vi: 'Chọn thời gian', en: 'Choose a time' },
  submitting: { ru: 'Оформляем…', vi: 'Đang đặt…', en: 'Placing order…' },
  needName: { ru: 'Напишите, как к вам обращаться.', vi: 'Vui lòng nhập tên của bạn.', en: 'Please tell us your name.' },
  badPhone: { ru: 'Проверьте номер телефона: только цифры, можно с +.', vi: 'Kiểm tra số điện thoại: chỉ gồm chữ số, có thể có dấu +.', en: 'Check the phone number: digits only, + is allowed.' },
  genericErr: { ru: 'Что-то пошло не так. Попробуйте ещё раз.', vi: 'Đã có lỗi. Vui lòng thử lại.', en: 'Something went wrong. Please try again.' },

  // Доставка
  deliveryHint: { ru: 'Только для жителей здания «Наполеон» (Napoleon Castle 1). Принесём к двери квартиры. Минимум за {m} минут.', vi: 'Chỉ dành cho cư dân tòa Napoleon (Napoleon Castle 1). Chúng tôi mang đến tận cửa căn hộ. Đặt trước ít nhất {m} phút.', en: 'Only for residents of the Napoleon building (Napoleon Castle 1). We bring it to your apartment door. At least {m} minutes ahead.' },
  whenDelivery: { ru: 'Когда привезти', vi: 'Giao lúc nào', en: 'When to deliver' },
  aptTitle: { ru: '🏢 Ваша квартира в «Наполеоне»', vi: '🏢 Căn hộ của bạn ở tòa Napoleon', en: '🏢 Your apartment in Napoleon' },
  aptFloor: { ru: 'Этаж', vi: 'Tầng', en: 'Floor' },
  aptNumber: { ru: 'Квартира', vi: 'Căn hộ', en: 'Apartment' },
  aptNumberPh: { ru: 'например, 05', vi: 'ví dụ: 05', en: 'e.g. 05' },
  aptLine: { ru: 'Наполеон, этаж {f}, кв. {a}', vi: 'Tòa Napoleon, tầng {f}, căn {a}', en: 'Napoleon, floor {f}, apt {a}' },
  aptTermsFree: { ru: '🛵 Доставка по зданию бесплатная.', vi: '🛵 Giao miễn phí trong tòa nhà.', en: '🛵 Delivery within the building is free.' },
  aptTermsPaid: { ru: '🛵 Доставка по зданию {fee}.', vi: '🛵 Phí giao trong tòa nhà: {fee}.', en: '🛵 Delivery within the building: {fee}.' },
  aptTermsMin: { ru: 'Заказ от {x} за блюда.', vi: 'Đơn từ {x} tiền món.', en: 'Minimum {x} for dishes.' },
  aptNeed: { ru: 'Укажите этаж и номер квартиры в «Наполеоне» (две цифры, например 05).', vi: 'Hãy nhập tầng và số căn hộ ở tòa Napoleon (hai chữ số, ví dụ 05).', en: 'Enter your floor and apartment number in Napoleon (two digits, e.g. 05).' },
  aptBadFloor: { ru: 'В «Наполеоне» этажи с {a} по {b}.', vi: 'Tòa Napoleon có tầng từ {a} đến {b}.', en: 'Napoleon has floors {a} to {b}.' },
  aptOnly: { ru: 'Доставляем только по зданию «Наполеон». Если вы не там, выберите «С собой» или «К визиту».', vi: 'Chúng tôi chỉ giao trong tòa Napoleon. Nếu bạn ở nơi khác, hãy chọn «Mang đi» hoặc «Đặt trước khi đến».', en: 'We deliver only within the Napoleon building. If you are elsewhere, choose Takeaway or For your visit.' },
  photoTitle: { ru: '📷 Фото места (по желанию)', vi: '📷 Ảnh địa điểm (không bắt buộc)', en: '📷 Photo of the place (optional)' },
  photoHint: { ru: 'Сфотографируйте вход, ворота или здание: курьеру будет проще вас найти.', vi: 'Chụp cổng, lối vào hoặc toà nhà để shipper dễ tìm bạn hơn.', en: 'Snap the entrance, gate or building so the courier finds you faster.' },
  photoAdd: { ru: 'Добавить фото', vi: 'Thêm ảnh', en: 'Add a photo' },
  photoReplace: { ru: 'Заменить фото', vi: 'Đổi ảnh', en: 'Replace photo' },
  photoBad: { ru: 'Не получилось открыть это фото. Попробуйте другое.', vi: 'Không mở được ảnh này. Hãy thử ảnh khác.', en: 'Couldn’t open this photo. Try another one.' },
  photoSending: { ru: 'Отправляем фото…', vi: 'Đang gửi ảnh…', en: 'Sending photo…' },
  photoSent: { ru: 'Фото места получено, курьер его увидит.', vi: 'Đã nhận ảnh, shipper sẽ xem được.', en: 'Photo received, the courier will see it.' },
  photoFailed: { ru: 'Заказ оформлен, но фото не отправилось. Добавьте его ещё раз здесь.', vi: 'Đơn đã đặt nhưng ảnh chưa gửi được. Hãy thêm lại ở đây.', en: 'Order placed, but the photo didn’t upload. Please add it again here.' },
  addrPinOnly: { ru: 'Точка на карте', vi: 'Điểm trên bản đồ', en: 'Pin on the map' },
  dist: { ru: '{km} км от ресторана', vi: 'cách nhà hàng {km} km', en: '{km} km from the restaurant' },
  dishesSum: { ru: 'Блюда', vi: 'Món ăn', en: 'Dishes' },
  deliveryFee: { ru: 'Доставка', vi: 'Phí giao hàng', en: 'Delivery' },
  deliveryFree: { ru: 'бесплатно', vi: 'miễn phí', en: 'free' },
  minOrderProblem: { ru: 'Доставка от {x} за блюда. Добавьте ещё на {y}.', vi: 'Giao hàng cho đơn từ {x}. Hãy thêm {y} nữa.', en: 'Delivery starts from {x} for dishes. Add {y} more.' },
  readyDelivery: { ru: 'Курьер уже едет к вам', vi: 'Shipper đang trên đường đến', en: 'The courier is on the way' },
  step_ready_delivery: { ru: 'В пути', vi: 'Đang giao', en: 'On the way' },
  step_completed_delivery: { ru: 'Доставлен', vi: 'Đã giao', en: 'Delivered' },
  err_DELIVERY_MIN_ORDER: { ru: 'Доставка от {min} за блюда.', vi: 'Giao hàng cho đơn từ {min}.', en: 'Delivery starts from {min} for dishes.' },
  err_DELIVERY_OFF: { ru: 'Доставка сейчас выключена. Выберите «С собой» или «К визиту».', vi: 'Hiện tạm ngừng giao hàng. Hãy chọn «Mang đi» hoặc «Đặt trước khi đến».', en: 'Delivery is switched off right now. Choose Takeaway or For your visit.' },
  err_DELIVERY_NO_APT: { ru: 'Укажите этаж и номер квартиры в «Наполеоне».', vi: 'Hãy nhập tầng và số căn hộ ở tòa Napoleon.', en: 'Enter your floor and apartment number in Napoleon.' },

  // Ошибки оформления (коды с сервера)
  err_EMPTY_CART: { ru: 'Корзина пуста.', vi: 'Giỏ hàng trống.', en: 'Your cart is empty.' },
  err_DISH_UNAVAILABLE: { ru: 'Одного из блюд больше нет в меню. Уберите его из корзины.', vi: 'Một món không còn trong thực đơn. Vui lòng bỏ món đó khỏi giỏ.', en: 'One of the dishes is no longer on the menu. Please remove it from the cart.' },
  err_DISH_SOLD_OUT: { ru: '«{name}» сейчас на стопе. Уберите блюдо из заказа.', vi: '«{name}» hiện tạm hết. Vui lòng bỏ món này khỏi đơn.', en: '«{name}» is unavailable right now. Please remove it from the order.' },
  err_ALCOHOL_NOT_ALLOWED: { ru: 'Алкоголь можно заказать только «к визиту».', vi: 'Đồ uống có cồn chỉ đặt được với «Đặt trước khi đến».', en: 'Alcohol can only be ordered “For your visit”.' },
  err_OPTION_REQUIRED: { ru: 'Для блюда «{name}» нужно выбрать вариант. Нажмите «Выбрать» в корзине.', vi: 'Món «{name}» cần chọn một lựa chọn. Bấm «Chọn» trong giỏ hàng.', en: 'Please choose an option for «{name}». Tap «Choose» in the cart.' },
  err_OPTION_INVALID: { ru: 'У блюда «{name}» изменились варианты. Нажмите «Изменить» и выберите заново.', vi: 'Lựa chọn của món «{name}» đã thay đổi. Bấm «Sửa» và chọn lại.', en: 'The options for «{name}» have changed. Tap «Change» and choose again.' },
  err_SLOT_FULL: { ru: 'Это время только что заняли. Выберите другое.', vi: 'Khung giờ này vừa kín. Vui lòng chọn giờ khác.', en: 'This time was just taken. Please choose another.' },
  err_SLOT_TOO_SOON: { ru: 'На это время уже не успеем приготовить. Выберите время позже.', vi: 'Không kịp chuẩn bị cho giờ này. Vui lòng chọn giờ muộn hơn.', en: 'We can’t have it ready by then. Please choose a later time.' },
  err_SLOT_INVALID: { ru: 'Выберите время из списка.', vi: 'Vui lòng chọn giờ trong danh sách.', en: 'Please choose a time from the list.' },
  err_SLOT_OUT_OF_RANGE: { ru: 'Заказать можно на сегодня и до 7 дней вперёд.', vi: 'Có thể đặt cho hôm nay và tối đa 7 ngày tới.', en: 'You can order for today and up to 7 days ahead.' },
  err_NOT_ACCEPTING: { ru: 'Сейчас ресторан не принимает предзаказы. Позвоните нам.', vi: 'Hiện nhà hàng không nhận đặt trước. Vui lòng gọi cho chúng tôi.', en: 'The restaurant is not taking pre-orders right now. Please call us.' },
  err_TYPE_NOT_AVAILABLE: { ru: 'Этот способ получения сейчас недоступен.', vi: 'Cách nhận món này hiện không khả dụng.', en: 'This option is not available right now.' },
  err_BAD_INPUT: { ru: 'Проверьте имя и телефон.', vi: 'Kiểm tra lại tên và số điện thoại.', en: 'Please check your name and phone.' },
  err_TG_AUTH: { ru: 'Telegram не подтвердил вход. Закройте меню и откройте его заново кнопкой в боте.', vi: 'Telegram chưa xác nhận đăng nhập. Hãy đóng thực đơn và mở lại bằng nút trong bot.', en: 'Telegram did not confirm the sign-in. Close the menu and open it again from the bot button.' },
  err_NETWORK: { ru: 'Нет связи. Проверьте интернет и нажмите ещё раз: заказ не задвоится.', vi: 'Mất kết nối. Kiểm tra internet và bấm lại: đơn sẽ không bị trùng.', en: 'No connection. Check the internet and tap again: the order won’t be duplicated.' },
  err_TABLE_NOT_FOUND: { ru: 'Не узнали этот QR-код. Позовите официанта, пожалуйста.', vi: 'Không nhận ra mã QR này. Vui lòng gọi nhân viên phục vụ.', en: 'We don’t recognise this QR code. Please call a waiter.' },
  err_TABLE_CLOSED: { ru: 'Сейчас ресторан закрыт, заказ со стола не принимаем.', vi: 'Nhà hàng hiện đã đóng cửa, không nhận gọi món tại bàn.', en: 'The restaurant is closed now, table orders are not accepted.' },
  err_BILL_EMPTY: { ru: 'В счёте пока ничего нет.', vi: 'Hóa đơn chưa có gì.', en: 'The bill is empty so far.' },
  err_BILL_CLOSED: { ru: 'Этот счёт уже закрыт. Обновите страницу.', vi: 'Hóa đơn này đã đóng. Vui lòng tải lại trang.', en: 'This bill is already closed. Please refresh the page.' },
  err_BILL_MERGED: { ru: 'Ваш счёт уже входит в общий счёт стола.', vi: 'Hóa đơn của bạn đã được gộp vào hóa đơn chung của bàn.', en: 'Your bill is already part of the table’s shared bill.' },
  err_BILL_PAYMENT_PENDING: { ru: 'Счёт уже оплачивается, объединить сейчас нельзя. Позовите официанта.', vi: 'Hóa đơn đang được thanh toán, không thể gộp lúc này. Vui lòng gọi nhân viên.', en: 'The bill is already being paid, it can’t be merged now. Please call a waiter.' },
  err_NOTHING_TO_MERGE: { ru: 'За столом нет других счетов.', vi: 'Bàn không có hóa đơn nào khác.', en: 'There are no other bills at this table.' },

  // Стол (QR на столе)
  atTable: { ru: 'Вы за столом', vi: 'Bạn đang ngồi tại', en: 'You are at' },
  tableHall: { ru: 'В зале, стол {n}', vi: 'Trong nhà, bàn {n}', en: 'Indoors, table {n}' },
  tableOut: { ru: 'На улице, стол {n}', vi: 'Ngoài trời, bàn {n}', en: 'Outdoors, table {n}' },
  table: { ru: 'Стол', vi: 'Bàn', en: 'Table' },
  callWaiter: { ru: 'Позвать официанта', vi: 'Gọi nhân viên', en: 'Call a waiter' },
  waiterComing: { ru: 'Официант уже идёт', vi: 'Nhân viên đang đến', en: 'A waiter is coming' },
  myBill: { ru: 'Мой счёт', vi: 'Hóa đơn của tôi', en: 'My bill' },
  myBillSum: { ru: 'Мой счёт · {sum}', vi: 'Hóa đơn · {sum}', en: 'My bill · {sum}' },
  tableHint: { ru: 'Заказ увидит администратор и сразу передаст на кухню. Обычно готовим 15–20 минут. Оплата по счёту в конце, по QR или наличными.', vi: 'Quản lý sẽ nhận đơn và chuyển ngay vào bếp. Thường mất 15–20 phút. Thanh toán theo hóa đơn khi kết thúc, bằng QR hoặc tiền mặt.', en: 'The manager sees your order and passes it straight to the kitchen. It usually takes 15–20 minutes. Pay the bill at the end, by QR or in cash.' },
  tableCommentPh: { ru: 'Например: без лука, сначала детям', vi: 'Ví dụ: không hành, mang món cho bé trước', en: 'For example: no onion, kids’ food first' },
  sendOrder: { ru: 'Отправить заказ · {sum}', vi: 'Gửi đơn · {sum}', en: 'Send order · {sum}' },
  tableErr: { ru: 'Что-то пошло не так. Попробуйте ещё раз или позовите официанта.', vi: 'Đã có lỗi. Vui lòng thử lại hoặc gọi nhân viên.', en: 'Something went wrong. Try again or call a waiter.' },
  st_sent: { ru: 'Отправлен, ждём подтверждения', vi: 'Đã gửi, chờ xác nhận', en: 'Sent, waiting for confirmation' },
  st_cooking: { ru: 'Принят, готовим', vi: 'Đã nhận, đang nấu', en: 'Accepted, cooking' },
  st_ready: { ru: 'Готово, несём', vi: 'Xong, đang mang ra', en: 'Ready, on its way' },
  st_served: { ru: 'Подано', vi: 'Đã phục vụ', en: 'Served' },
  st_cancelled: { ru: 'Отменён', vi: 'Đã hủy', en: 'Cancelled' },
  billEmpty: { ru: 'Вы ещё ничего не заказали с этого телефона. Выберите блюда в меню и нажмите «Отправить заказ».', vi: 'Bạn chưa gọi món nào từ điện thoại này. Hãy chọn món trong thực đơn và bấm «Gửi đơn».', en: 'You haven’t ordered anything from this phone yet. Choose dishes from the menu and tap “Send order”.' },
  otherBills: { ru: 'За столом есть другие счета: {n} на {sum}.', vi: 'Bàn có hóa đơn khác: {n} hóa đơn, tổng {sum}.', en: 'There are other bills at the table: {n} for {sum}.' },
  billPaid: { ru: 'Счёт №{n} оплачен: {sum}. Спасибо, что были у нас!', vi: 'Hóa đơn số {n} đã thanh toán: {sum}. Cảm ơn bạn đã ghé thăm!', en: 'Bill #{n} is paid: {sum}. Thank you for visiting us!' },
  billPaidCash: { ru: 'Счёт №{n} оплачен наличными: {sum}. Спасибо, что были у нас!', vi: 'Hóa đơn số {n} đã thanh toán bằng tiền mặt: {sum}. Cảm ơn bạn đã ghé thăm!', en: 'Bill #{n} is paid in cash: {sum}. Thank you for visiting us!' },
  billAgain: { ru: 'Захотите что-то ещё — просто закажите из меню, откроется новый счёт.', vi: 'Muốn gọi thêm, cứ chọn trong thực đơn, hóa đơn mới sẽ được mở.', en: 'Want something else? Just order from the menu and a new bill will open.' },
  billNo: { ru: 'счёт №{n}', vi: 'hóa đơn số {n}', en: 'bill #{n}' },
  wholeTable: { ru: 'весь стол', vi: 'cả bàn', en: 'whole table' },
  sharedHint: { ru: 'Это общий счёт стола: в нём заказы со всех телефонов, которые объединили.', vi: 'Đây là hóa đơn chung của bàn: gồm đơn từ tất cả điện thoại đã gộp.', en: 'This is the shared table bill: it includes orders from all phones that were merged.' },
  othersOne: { ru: 'За столом ещё один счёт на {sum}.', vi: 'Bàn còn một hóa đơn khác, {sum}.', en: 'There is one more bill at the table for {sum}.' },
  othersMany: { ru: 'За столом ещё {n} счёта на {sum}.', vi: 'Bàn còn {n} hóa đơn khác, tổng {sum}.', en: 'There are {n} more bills at the table for {sum}.' },
  payAllSure: { ru: 'Да, оплачу весь стол · {sum}', vi: 'Vâng, tôi trả cho cả bàn · {sum}', en: 'Yes, I’ll pay for the whole table · {sum}' },
  payAll: { ru: 'Оплатить весь стол одним счётом', vi: 'Thanh toán cả bàn chung một hóa đơn', en: 'Pay for the whole table in one bill' },
  payAllNote: { ru: 'Счета других телефонов закроются и войдут в ваш.', vi: 'Hóa đơn của các điện thoại khác sẽ được đóng và gộp vào hóa đơn của bạn.', en: 'Bills from the other phones will close and be added to yours.' },
  askBill: { ru: 'Попросить счёт', vi: 'Yêu cầu tính tiền', en: 'Ask for the bill' },
  waiterSoon: { ru: 'Официант скоро подойдёт. Можно оплатить наличными или по QR:', vi: 'Nhân viên sẽ đến ngay. Bạn có thể trả tiền mặt hoặc qua QR:', en: 'A waiter will come shortly. You can pay in cash or by QR:' },
  tableTransferNote: { ru: 'В комментарии к переводу укажите: <b>стол {t}, счёт {n}</b>.', vi: 'Trong nội dung chuyển khoản ghi: <b>bàn {t}, hóa đơn {n}</b>.', en: 'In the transfer comment, write: <b>table {t}, bill {n}</b>.' },
  paidQr: { ru: 'Я оплатил по QR', vi: 'Tôi đã thanh toán qua QR', en: 'I have paid by QR' },
  billReported: { ru: 'Спасибо! Вы сообщили об оплате {sum}. Сотрудник проверит поступление и закроет счёт.', vi: 'Cảm ơn bạn! Bạn đã báo thanh toán {sum}. Nhân viên sẽ kiểm tra tiền về và đóng hóa đơn.', en: 'Thank you! You reported paying {sum}. Staff will check the transfer and close the bill.' },
  billFailed: { ru: 'Не получилось. Позовите официанта.', vi: 'Không thành công. Vui lòng gọi nhân viên.', en: 'That didn’t work. Please call a waiter.' },

  // Страница заказа
  orderTitle: { ru: 'Заказ — VIBE', vi: 'Đơn hàng — VIBE', en: 'Order — VIBE' },
  orderLoading: { ru: 'Загружаем заказ…', vi: 'Đang tải đơn hàng…', en: 'Loading the order…' },
  orderNotFound: { ru: 'Заказ не найден. Проверьте ссылку.', vi: 'Không tìm thấy đơn hàng. Vui lòng kiểm tra đường dẫn.', en: 'Order not found. Please check the link.' },
  order: { ru: 'Заказ', vi: 'Đơn hàng', en: 'Order' },
  step_awaiting_payment: { ru: 'Заказ принят', vi: 'Đã nhận đơn', en: 'Order received' },
  step_awaiting_payment_sub: { ru: 'Ждём оплату по QR', vi: 'Đang chờ thanh toán qua QR', en: 'Waiting for QR payment' },
  step_payment_checking: { ru: 'Проверяем оплату', vi: 'Đang kiểm tra thanh toán', en: 'Checking payment' },
  step_payment_checking_sub: { ru: 'Сотрудник сверяет поступление, обычно до 10 минут', vi: 'Nhân viên đang kiểm tra tiền về, thường trong vòng 10 phút', en: 'Staff are checking the transfer, usually within 10 minutes' },
  step_confirmed: { ru: 'Оплата подтверждена', vi: 'Đã xác nhận thanh toán', en: 'Payment confirmed' },
  step_confirmed_sub: { ru: 'Скоро начнём готовить', vi: 'Sắp bắt đầu nấu', en: 'We’ll start cooking soon' },
  step_cooking: { ru: 'Готовим', vi: 'Đang nấu', en: 'Cooking' },
  step_ready: { ru: 'Готово', vi: 'Đã xong', en: 'Ready' },
  step_completed: { ru: 'Выдано', vi: 'Đã giao', en: 'Handed over' },
  step_completed_sub: { ru: 'Приятного аппетита!', vi: 'Chúc ngon miệng!', en: 'Enjoy your meal!' },
  readyVisit: { ru: 'Ждём вас, стол готов', vi: 'Bàn đã sẵn sàng, chúng tôi đang chờ bạn', en: 'Your table is ready, we’re waiting for you' },
  readyPickup: { ru: 'Можно забирать на кассе', vi: 'Bạn có thể nhận tại quầy', en: 'Ready for pickup at the counter' },
  sayNumber: { ru: '{x}. Назовите номер {n}.', vi: '{x}. Hãy đọc số {n}.', en: '{x}. Just say number {n}.' },
  cancelledOrder: { ru: 'Заказ отменён. Если это ошибка, напишите или позвоните нам.', vi: 'Đơn hàng đã bị hủy. Nếu có nhầm lẫn, hãy nhắn tin hoặc gọi cho chúng tôi.', en: 'The order was cancelled. If this is a mistake, message or call us.' },
  toPay: { ru: 'Сумма к оплате', vi: 'Số tiền cần thanh toán', en: 'Amount to pay' },
  qrMissing: { ru: 'QR-код временно недоступен. Покажите номер заказа сотруднику.', vi: 'Mã QR tạm thời không khả dụng. Hãy đưa số đơn cho nhân viên.', en: 'The QR code is temporarily unavailable. Show the order number to staff.' },
  transferNote: { ru: 'В комментарии к переводу укажите номер заказа <b>{n}</b>, так мы быстрее найдём ваш платёж.', vi: 'Trong nội dung chuyển khoản ghi số đơn <b>{n}</b> để chúng tôi tìm thanh toán nhanh hơn.', en: 'Put the order number <b>{n}</b> in the transfer comment so we can find your payment faster.' },
  saveQr: { ru: 'Сохранить QR', vi: 'Lưu mã QR', en: 'Save QR' },
  copyNo: { ru: 'Копировать №', vi: 'Sao chép số đơn', en: 'Copy number' },
  copied: { ru: 'Скопировано', vi: 'Đã sao chép', en: 'Copied' },
  iPaid: { ru: 'Я оплатил', vi: 'Tôi đã thanh toán', en: 'I have paid' },
  iPaidHint: { ru: 'Нажмите после перевода. Готовить начнём, когда сотрудник увидит деньги на счёте.', vi: 'Bấm sau khi chuyển khoản. Bếp bắt đầu nấu khi nhân viên thấy tiền đã về.', en: 'Tap after the transfer. We start cooking once staff see the money in the account.' },
  reported: { ru: 'Спасибо! Вы сообщили об оплате {sum}. Сейчас сотрудник проверит поступление и подтвердит заказ.', vi: 'Cảm ơn bạn! Bạn đã báo thanh toán {sum}. Nhân viên sẽ kiểm tra tiền về và xác nhận đơn.', en: 'Thank you! You reported paying {sum}. Staff will now check the transfer and confirm the order.' },
  followTg: { ru: 'Получать статус в Telegram', vi: 'Nhận trạng thái qua Telegram', en: 'Get updates in Telegram' },
  statusInTg: { ru: 'Статус придёт сообщением в Telegram, а эта страница обновляется сама.', vi: 'Trạng thái sẽ được gửi qua Telegram, trang này cũng tự cập nhật.', en: 'Updates will come as a Telegram message, and this page refreshes itself.' },
  statusHere: { ru: 'Сохраните эту страницу: статус обновляется сам.', vi: 'Hãy lưu trang này: trạng thái tự cập nhật.', en: 'Keep this page: the status updates by itself.' },
};

/** Текст на языке гостя: t('cartBar', { n: 2, sum: '…' }). */
function t(key, vars = {}) {
  const e = I18N[key];
  const s = e ? e[LANG] ?? e.ru : key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Строка RU · VI · EN над шапкой. Выбор запоминается, страница перерисовывается на новом языке. */
function renderLangbar() {
  const bar = document.getElementById('langbar');
  if (!bar) return;
  const names = { ru: 'Русский', vi: 'Tiếng Việt', en: 'English' };
  bar.setAttribute('aria-label', t('langLabel'));
  bar.innerHTML = `<div class="wrap langbar-in">${LANGS.map(
    (l) => `<button type="button" lang="${l}" data-lang="${l}" aria-pressed="${l === LANG}" title="${names[l]}">${l.toUpperCase()}</button>`,
  ).join('<span aria-hidden="true">·</span>')}</div>`;
  bar.onclick = (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === LANG) return;
    try { localStorage.setItem('vibe_lang', b.dataset.lang); } catch { /* приватный режим */ }
    const u = new URL(location.href);
    u.searchParams.set('lang', b.dataset.lang); // работает и без localStorage
    location.replace(u.toString());
  };
}

/** Подписи статичной вёрстки: data-i18n (текст), data-i18n-attr="атрибут:ключ". */
function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
renderLangbar();
applyStaticI18n();
