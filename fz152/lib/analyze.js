'use strict';

const { extractRequisites } = require('./inn');

// ---------- Справочники ----------

const POLICY_RE = /(политик|конфиденциальн|privacy|policy|personal[-_ ]?data|персональн|politika)/i;
const POLICY_PD_RE = /(персональн|конфиденц|privacy|personal[-_ ]?data)/i;
// «Согласие», но не «соглашение» (soglasie, а не soglashenie).
const CONSENT_DOC_RE = /(согласи[еяю]|consent|soglasi[ey])/i;
const COOKIE_DOC_RE = /(cookie|куки)/i;
const OFFER_RE = /(оферт|oferta|offer|договор|dogovor|пользовательск\S*\s+соглашени|услови\S*\s+(оказания|обучения|продажи|использования|покупки|участия)|правила\s+(оказания|пользования|покупки)|terms)/i;
const REFUND_RE = /(возврат|vozvrat|refund)/i;
const PD_WORDS_RE = /(персональн|обработк|конфиденц|политик|152)/i;
const AD_WORDS_RE = /(реклам|рассылк|новост|предложени|акци|звонк|маркетинг|информационн)/i;
// Ссылки на «раздел» юридических документов («Правовая информация», /legal) засчитываем как путь к политике.
const HUB_RE = /(правов\S*\s+информац|юридическ\S*\s+информац|правовые\s+документ|^документы$|\/legal\b|\/docs?\b|\/documents\b)/i;
// Поля, по которым форму точно можно считать сбором персональных данных.
// Одного имени мало: нужна возможность связаться с человеком или документ.
const STRONG_KINDS = new Set(['телефон', 'e-mail', 'мессенджер', 'паспортные данные', 'СНИЛС']);
// Доменные зоны второго уровня, где «сайт» - это третий уровень.
const MULTI_SUFFIX = new Set(['tilda.ws', 'github.io', 'com.ru', 'net.ru', 'org.ru', 'msk.ru', 'spb.ru', 'pp.ru', 'co.uk', 'com.ua', 'org.ua', 'com.kz', 'gitlab.io', 'netlify.app', 'vercel.app', 'taplink.cc', 'nethouse.ru', 'wixsite.com', 'tb.ru', 'ucoz.ru', 'narod.ru']);
const PASSIVE_RE = /(нажимая|нажав|отправляя|отправив|оставляя|оставив|заполняя|заполнив|регистрируясь|продолжая)[^.!?]{0,160}(соглаша|соглас|принима|даю|подтвержда|ознакомл)/i;
const ANALYTICS_COOKIE_RE = /^(_ga|_gid|_gat|_gcl|_ym|_fbp|_fbc|tmr_|_hj|_clck|_clsk|_ttp)/;

// Продажи и подписки.
const PAY_HOSTS_RE = /(^|\.)(yookassa\.ru|yoomoney\.ru|cloudpayments\.ru|robokassa\.(ru|com)|securepay\.tinkoff\.ru|tinkoff\.ru|tbank\.ru|payform\.ru|prodamus\.ru|paykeeper\.ru|platron\.ru|payanyway\.ru|unitpay\.ru|paymaster\.ru|lava\.top)$/;
const PRICE_RE = /\d[\d\s ]{1,9}\s?(₽|руб)/i;
const BUY_RE = /(купить|оплатить|оплата|заказать|в корзину|оформить заказ|тариф|стоимость|записаться на курс|забронировать)/i;
const TRIAL_RE = /(за\s*1\s*(₽|рубл\S*)|пробн\S*\s+(период|доступ|недел)\S*|ежемесячн\S*\s+(подписк|списан|плат)\S*|подписк\S*\s+(за|от)\s*\d[\d\s]*\s?(₽|руб))/i;
const AUTORENEW_RE = /(автопродл|автоматическ\S*\s+(продл|списан)|рекуррент|отключить\s+(подписку|автопл|автопрод)|отменить\s+подписку|отказаться\s+от\s+подписк)/i;
const REFUND_TEXT_RE = /(возврат\S*\s+(денег|денежных|средств|оплаты)|верн[её]м\s+деньги|гаранти\S*\s+возврата|условия\s+возврата)/i;
// Платная доп. опция: в подписи и деньги, и слова про «добавить / дополнительно / подписку».
// Галочка с названием самого товара (выбор покупки в форме GetCourse) платной опцией не считается.
const MONEY_RE = /(₽|руб|\d\s?р\.)/i;
const ADDON_RE = /(добав|дополнительн|доп\.\s|страхов|подписк|автопродл|сертификат|упаковк|ускорен|приоритет|vip|premium|премиум|расширенн)/i;
const PAID_STRONG_RE = /(₽|руб\S*|доплат|автопродл)/i;

// Приёмы давления и громкие обещания (ищем в видимом тексте).
const SCARCITY_RE = /(осталось\s+(всего\s+)?\d+\s+мест\S*|мест\S*\s+осталось|последние\s+\d+\s+мест\S*|только\s+сегодня|цена\s+(вырастет|повысится|увеличится)\s+(через|завтра)|успей(те)?\s+(купить|записаться|забрать))/gi;
// Кнопка отказа, которая стыдит человека. Ищем только в текстах кнопок и ссылок, а не в обычном тексте.
const SHAME_RE = /^(нет,?\s+)?(спасибо,?\s+)?((я\s+)?не\s+хочу\s+\S.{2,50}|мне\s+не\s+(нужн|интересн)\S*\s+\S.{2,40}|я\s+(лучше\s+)?останусь\s+\S.{2,40})$/i;
// Обещания именно о школе, курсе или результате. Общие слова вроде «самое лучшее, что со мной было» не считаем.
const PROMISE_RE = /(лучш(ая|ий|ее|ие|ей|ую|его|ем)\s+(онлайн-?\s*)?(школ|курс|академи|программ|обучени)\S*|лучш\S+\s+(в\s+россии|в\s+мире|на\s+рынке|в\s+городе|в\s+снг|в\s+стране)|сам(ая|ый|ое|ые|ой|ую)\s+(эффективн|быстр|полн|современн|крупн)\S*\s+(способ|метод|курс|школ|программ|обучени|путь|систем)\S*|№\s?1(?!\d)|номер\s+один(?![а-яё])|лидер\S*\s+рынка|гарантир\S*\s+(трудоустройств|результат|доход|заработ)\S*|гаранти\S*\s+(трудоустройств|результата|дохода|заработка)\S*|100\s?%\s*(результат|гаранти|трудоустройств)\S*|(заработ\S*|доход\S*)\s+(от|до)\s+\d[\d \u00a0]*(\s?000|\s?тыс\S*|\s?₽|\s?руб\S*))/gi;

// Дети, родители, рассылки.
const AGE_RE = /(\b(от|с)\s?[3-9]\s?(до|-)\s?1[0-7]\s?лет|\b[3-9]\s?-\s?1[0-7]\s?лет)/i;
const CHILD_STRONG_RE = /(для\s+детей|детск(ая|ий|ое|ие)\s+(школ|курс|студи|центр|програм|лагер)\S*|\b(от|с)\s?[3-9]\s?(до|-)\s?1[0-7]\s?лет|\b[3-9]\s?-\s?1[0-7]\s?лет)/i;
const CHILD_WORDS_RE = /(ребён\S*|ребен\S*|школьник\S*|дошкольник\S*|подростк\S*|детям|детей)/gi;
const PARENT_RE = /(законн\S*\s+представител|родител|опекун)/i;
const SUBSCRIBE_RE = /(подпис\S*\s+на\s+(рассылк|новост)|рассылк|newsletter|subscribe|подписаться)/i;
const UNSUB_RE = /(отписа|отказаться\s+от\s+(получения|рассылк)|отозвать\s+согласие\s+на\s+(получение|рассылк)|unsubscribe)/i;

// Лицензии.
const STOCK_HOST_RE = /(^|\.)(shutterstock\.com|istockphoto\.com|gettyimages\.(com|ru)|depositphotos\.com|dreamstime\.com|123rf\.com|alamy\.com|ftcdn\.net|lori\.ru|pressfoto\.ru|freepik\.com)$/;
const STOCK_FILE_RE = /(shutterstock_\d+|depositphotos_\d+|istock-?\d{5,}|istockphoto-\d+|gettyimages-\d+|adobestock_\d+|dreamstime_\w*\d+|\d{5,}-stock-photo|photodune-\d+|lori-\d{5,})/i;
const PAID_FONTS = [
  ['Gilroy', /^gilroy/i], ['Proxima Nova', /^proxima\s?nova/i], ['Circe', /^circe\b/i], ['TT Norms', /^tt\s?norms/i],
  ['TT Commons', /^tt\s?commons/i], ['TT Hoves', /^tt\s?hoves/i], ['TT Firs', /^tt\s?firs/i], ['TT Travels', /^tt\s?travels/i],
  ['Cera Pro', /^cera\s?pro/i], ['Graphik', /^graphik/i], ['Helvetica Neue', /^helvetica\s?neue/i], ['SF Pro', /^sf\s?(pro|ui)/i],
  ['Futura PT', /^futura\s?pt/i], ['Avenir', /^avenir/i], ['Gotham', /^gotham/i], ['Brandon Grotesque', /^brandon/i],
  ['Circular', /^circular/i], ['Euclid', /^euclid/i], ['Geometria', /^geometria/i], ['Museo Sans', /^museo\s?sans/i],
  ['Pragmatica', /^pragmatica/i], ['Stem', /^stem\b/i], ['Mont', /^mont(?!serrat)\b/i], ['Aeonik', /^aeonik/i],
  ['GT Walsheim', /^gt\s?walsheim/i], ['Suisse', /^suisse/i], ['Neue Haas', /^neue\s?haas/i], ['Akzidenz', /^akzidenz/i],
];

// Сторонние сервисы: имя, зарубежный ли, тип. Тип влияет на серьёзность («лёгкие»: шрифты, видео, CDN, карты).
const h = (re) => (u) => re.test(u.hostname);
const SERVICES = [
  // российские
  { name: 'Яндекс Метрика', foreign: false, kind: 'analytics', test: h(/(^|\.)mc\.yandex\.(ru|com)$/) },
  { name: 'Яндекс Карты', foreign: false, kind: 'maps', test: h(/(^|\.)api-maps\.yandex\.ru$/) },
  { name: 'Yandex SmartCaptcha', foreign: false, kind: 'captcha', test: h(/(^|\.)smartcaptcha\.yandexcloud\.net$/) },
  { name: 'Яндекс (другие сервисы)', foreign: false, kind: 'other', test: h(/(^|\.)(yandex\.(ru|com|net)|yastatic\.net|yandex\.st|yandexcloud\.net)$/) },
  { name: 'VK (пиксель, виджеты)', foreign: false, kind: 'ads', test: h(/(^|\.)(vk\.com|vk\.ru|userapi\.com|vk-portal\.net|vkuser\.net|vk\.me)$/) },
  { name: 'Top@Mail.ru / VK Реклама', foreign: false, kind: 'ads', test: h(/(^|\.)(top-fwz1\.mail\.ru|mail\.ru)$/) },
  { name: 'Jivo', foreign: false, kind: 'chat', test: h(/(^|\.)(jivosite\.com|jivo\.ru|jivochat\.com)$/) },
  { name: 'Битрикс24', foreign: false, kind: 'crm', test: h(/(^|\.)(bitrix24\.(ru|com)|bitrix\.info)$/) },
  { name: 'amoCRM', foreign: false, kind: 'crm', test: h(/(^|\.)(amocrm\.(ru|com)|amo\.tm)$/) },
  { name: 'Calltouch', foreign: false, kind: 'calltracking', test: h(/(^|\.)calltouch\.ru$/) },
  { name: 'CoMagic / UIS', foreign: false, kind: 'calltracking', test: h(/(^|\.)(comagic\.ru|uiscom\.ru)$/) },
  { name: 'Roistat', foreign: false, kind: 'analytics', test: h(/(^|\.)roistat\.com$/) },
  { name: 'Envybox', foreign: false, kind: 'chat', test: h(/(^|\.)envybox\.io$/) },
  { name: 'CallbackKiller', foreign: false, kind: 'chat', test: h(/(^|\.)callbackkiller\.(ru|com)$/) },
  { name: 'Carrot quest', foreign: false, kind: 'chat', test: h(/(^|\.)carrotquest\.(io|app)$/) },
  { name: 'Unisender', foreign: false, kind: 'mail', test: h(/(^|\.)unisender\.com$/) },
  { name: 'DashaMail', foreign: false, kind: 'mail', test: h(/(^|\.)dashamail\.(ru|com)$/) },
  { name: 'Senler', foreign: false, kind: 'mail', test: h(/(^|\.)senler\.ru$/) },
  { name: 'ЮKassa / ЮMoney', foreign: false, kind: 'payments', test: h(/(^|\.)(yookassa\.ru|yoomoney\.ru)$/) },
  { name: 'CloudPayments', foreign: false, kind: 'payments', test: h(/(^|\.)cloudpayments\.ru$/) },
  { name: 'Робокасса', foreign: false, kind: 'payments', test: h(/(^|\.)robokassa\.(ru|com)$/) },
  { name: 'Т-Банк (оплата)', foreign: false, kind: 'payments', test: h(/(^|\.)(tinkoff\.ru|tbank\.ru)$/) },
  { name: 'Продамус', foreign: false, kind: 'payments', test: h(/(^|\.)(payform\.ru|prodamus\.ru)$/) },
  { name: 'GetCourse', foreign: false, kind: 'platform', test: h(/(^|\.)(getcourse\.ru|gcdn\.co|gcfiles\.net|gcext\.su|gceuproxy\.com|chatium\.io)$/) },
  { name: 'Rutube', foreign: false, kind: 'video', test: h(/(^|\.)rutube\.ru$/) },
  { name: 'Kinescope', foreign: false, kind: 'video', test: h(/(^|\.)(kinescope\.io|kinescopecdn\.net)$/) },
  { name: 'Boomstream', foreign: false, kind: 'video', test: h(/(^|\.)boomstream\.com$/) },
  // зарубежные
  { name: 'Google Analytics', foreign: true, kind: 'analytics', test: h(/(^|\.)(google-analytics\.com|analytics\.google\.com)$/) },
  { name: 'Google Tag Manager', foreign: true, kind: 'analytics', test: h(/(^|\.)googletagmanager\.com$/) },
  { name: 'Google Ads', foreign: true, kind: 'ads', test: h(/(^|\.)(doubleclick\.net|googleadservices\.com|googlesyndication\.com)$/) },
  { name: 'Google reCAPTCHA', foreign: true, kind: 'captcha', test: (u) => /(^|\.)(google\.com|gstatic\.com|recaptcha\.net)$/.test(u.hostname) && /\/recaptcha/.test(u.pathname) },
  { name: 'Google Fonts', foreign: true, kind: 'fonts', test: h(/(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/) },
  { name: 'Google Maps', foreign: true, kind: 'maps', test: h(/(^|\.)(maps\.googleapis\.com|maps\.gstatic\.com)$/) },
  { name: 'Google CDN', foreign: true, kind: 'cdn', test: h(/(^|\.)ajax\.googleapis\.com$/) },
  { name: 'Meta Pixel (Facebook)', foreign: true, kind: 'ads', meta: true, test: (u) => /(^|\.)connect\.facebook\.net$/.test(u.hostname) || (/(^|\.)facebook\.com$/.test(u.hostname) && /^\/tr/.test(u.pathname)) },
  { name: 'TikTok Pixel', foreign: true, kind: 'ads', test: h(/(^|\.)analytics\.tiktok\.com$/) },
  { name: 'Hotjar', foreign: true, kind: 'analytics', test: h(/(^|\.)hotjar\.(com|io)$/) },
  { name: 'Microsoft Clarity', foreign: true, kind: 'analytics', test: h(/(^|\.)clarity\.ms$/) },
  { name: 'Bing Ads', foreign: true, kind: 'ads', test: h(/(^|\.)bat\.bing\.com$/) },
  { name: 'Sentry', foreign: true, kind: 'analytics', test: h(/(^|\.)sentry\.io$/) },
  { name: 'Cloudflare', foreign: true, kind: 'cdn', test: h(/(^|\.)(cdnjs\.cloudflare\.com|cloudflareinsights\.com)$/) },
  { name: 'jsDelivr (CDN)', foreign: true, kind: 'cdn', test: h(/(^|\.)jsdelivr\.(net|com)$/) },
  { name: 'unpkg (CDN)', foreign: true, kind: 'cdn', test: h(/(^|\.)unpkg\.com$/) },
  { name: 'Bootstrap CDN', foreign: true, kind: 'cdn', test: h(/(^|\.)bootstrapcdn\.com$/) },
  { name: 'Font Awesome', foreign: true, kind: 'fonts', test: h(/(^|\.)fontawesome\.com$/) },
  { name: 'Adobe Fonts', foreign: true, kind: 'fonts', test: h(/(^|\.)typekit\.(net|com)$/) },
  { name: 'OneSignal', foreign: true, kind: 'push', test: h(/(^|\.)onesignal\.com$/) },
  { name: 'SendPulse', foreign: true, kind: 'mail', test: h(/(^|\.)sendpulse\.com$/) },
  { name: 'Tawk.to (чат)', foreign: true, kind: 'chat', test: h(/(^|\.)tawk\.to$/) },
  { name: 'Intercom (чат)', foreign: true, kind: 'chat', test: h(/(^|\.)(intercom\.io|intercomcdn\.com)$/) },
  { name: 'LiveChat (чат)', foreign: true, kind: 'chat', test: h(/(^|\.)livechatinc\.com$/) },
  { name: 'Crisp (чат)', foreign: true, kind: 'chat', test: h(/(^|\.)crisp\.chat$/) },
  { name: 'YouTube (видео)', foreign: true, kind: 'video', test: h(/(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com)$/) },
  { name: 'Vimeo (видео)', foreign: true, kind: 'video', test: h(/(^|\.)(vimeo\.com|vimeocdn\.com)$/) },
  // Прочие домены Google (после конкретных сервисов Google выше).
  { name: 'Google (другие сервисы)', foreign: true, kind: 'cdn', test: h(/(^|\.)(google\.(com|ru)|gstatic\.com|googleapis\.com|googleusercontent\.com)$/) },
];
const LIGHT_KINDS = new Set(['fonts', 'video', 'cdn', 'maps']);
// Домены самой платформы сайта: в список сторонних сервисов не попадают.
const PLATFORM_HOSTS_RE = /(^|\.)(tildacdn\.(com|net|pro|one)|tildaapi\.com|tilda\.(ws|cc)|tilda\.ru)$/;

const FOREIGN_FORMS = [
  { name: 'Google Forms', test: (u) => (/(^|\.)docs\.google\.com$/.test(u.hostname) && /^\/forms/.test(u.pathname)) || /(^|\.)forms\.gle$/.test(u.hostname) },
  { name: 'Typeform', test: (u) => /(^|\.)typeform\.com$/.test(u.hostname) && u.pathname.length > 1 },
  { name: 'JotForm', test: (u) => /(^|\.)jotform\.(com|eu|me)$/.test(u.hostname) },
  { name: 'Tally', test: (u) => /(^|\.)tally\.so$/.test(u.hostname) },
  { name: 'Calendly', test: (u) => /(^|\.)calendly\.com$/.test(u.hostname) && u.pathname.length > 1 },
  { name: 'HubSpot Forms', test: (u) => /(^|\.)(hsforms\.net|hsforms\.com)$/.test(u.hostname) },
  { name: 'Microsoft Forms', test: (u) => /(^|\.)forms\.(office|microsoft)\.com$/.test(u.hostname) },
];

const GENERIC_LOCAL_RE = /^(info|hello|hi|mail|office|support|help|sales|admin|contact|contacts|zakaz|order|orders|school|team|manager|pr|marketing|partner|partners|reception|client|clients|feedback|welcome|edu|study|kurs|kursy|courses|academy|director|buh|hr|job|jobs|press|media|service|shop|store|booking|zapis|priem|post|general|company|studio|ask|question|questions|care|customer|otdel|sale|corp)([._-]|\d|$)/i;
const BAD_EMAIL_RE = /(\.(png|jpe?g|gif|webp|svg|js|css|ico)$)|(@(example|domain|yourdomain|site|mysite)\.)|(^(name|your|email|example|test|user|username|ivanov|login)@)|sentry|wixpress/i;

// Пояснение к пункту чек-листа про уведомление в Роскомнадзор (его проверяют вручную).
const RKN_NOTE = ' в реестре операторов на pd.rkn.gov.ru. С 30 мая 2025 года за неподачу уведомления штрафуют на сумму до 300 тыс. ₽ (ч. 10 ст. 13.11 КоАП).';

// Фразы, которые добавляются к замечаниям только при определённых находках.
const EXTRA_NOTES = {
  meta: ' И отдельно: компания Meta признана в России экстремистской организацией, так что её пиксель на сайте - дополнительный риск.',
  crossBorderDescribed: 'В политике упоминается трансграничная передача. Проверьте, что уведомление о ней подано в Роскомнадзор.',
  fontsTilda: ' Если шрифт выбран из встроенной библиотеки Tilda, лицензия уже есть.',
  fontsAdobe: ' Шрифты, подключённые через Adobe Fonts, уже лицензированы.',
  reviewsManual: 'Автоматически это не проверить. Убедитесь, что все отзывы от реальных людей, и дайте ссылки на независимые площадки.',
};

// Вес замечаний для сортировки «горячих» сайтов.
const WEIGHT = { high: 3, medium: 2, low: 1 };

// Разделы отчёта (в этом порядке).
const GROUPS = [
  { id: 'pd', title: 'Персональные данные' },
  { id: 'cookie', title: 'Cookie' },
  { id: 'commerce', title: 'Продажи, реклама и отзывы' },
  { id: 'a11y', title: 'Удобство для всех' },
  { id: 'license', title: 'Лицензии на фото и шрифты' },
];
const GROUP_ORDER = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));

// ---------- Тексты замечаний ----------
// {fields}, {services} и т. п. подставляются при формировании отчёта.

const RULES = {
  // --- Персональные данные ---
  no_https: {
    group: 'pd', severity: 'high',
    title: 'Сайт работает без HTTPS',
    why: 'Имя и телефон из заявок передаются в открытом виде, их можно перехватить. Закон требует защищать персональные данные (ст. 19 152-ФЗ), а браузер ещё и показывает посетителям «Не защищено», что отпугивает.',
    fix: 'Подключите SSL-сертификат (у большинства хостингов и конструкторов он бесплатный) и включите автоматический переход с http на https.',
    tilda: 'В Tilda это делается в настройках сайта, в разделе домена: включите HTTPS и переадресацию на него.',
    short: 'сайт работает без HTTPS, и данные из заявок передаются незащищёнными',
  },
  no_policy: {
    group: 'pd', severity: 'high',
    title: 'Нет политики обработки персональных данных',
    why: 'Если сайт собирает заявки, политику нужно выложить там же, где стоят формы (ч. 2 ст. 18.1 152-ФЗ). Это одно из самых частых нарушений, за него штрафуют по ч. 3 ст. 13.11 КоАП.',
    fix: 'Сделайте отдельную страницу с политикой и поставьте ссылку на неё в подвал и рядом с каждой формой. Политика должна описывать именно ваш сайт: какие данные собираете, зачем, какие сервисы подключены и сколько храните.',
    tilda: 'В Tilda создайте отдельную страницу «Политика обработки персональных данных» и добавьте ссылку в подвал и под кнопку каждой формы.',
    short: 'на сайте нет политики обработки персональных данных, хотя формы собирают {fields}',
  },
  policy_inside_offer: {
    group: 'pd', severity: 'medium',
    title: 'Политика не выделена в отдельный документ',
    why: 'Отдельной политики обработки персональных данных на сайте нет: правила, похоже, описаны внутри пользовательского соглашения или оферты. Закон требует опубликовать политику и дать к ней свободный доступ (ч. 2 ст. 18.1 152-ФЗ). Когда она спрятана в длинном соглашении, посетителю трудно её найти, а проверяющий может решить, что политики нет.',
    fix: 'Вынесите раздел о персональных данных в отдельный документ «Политика обработки персональных данных» и поставьте прямую ссылку на него в подвале и рядом с формами.',
    short: 'политика обработки данных не выделена в отдельный документ, а спрятана в пользовательском соглашении',
  },
  policy_broken: {
    group: 'pd', severity: 'high',
    title: 'Ссылка на политику не работает',
    why: 'Ссылка ведёт на ошибку или на страницу, где нет ни слова о персональных данных. Для проверяющего это то же самое, что политики нет вовсе.',
    fix: 'Почините ссылку и выложите актуальный текст политики.',
    short: 'ссылка на политику обработки данных ведёт на ошибку',
  },
  policy_not_near_forms: {
    group: 'pd', severity: 'medium',
    title: 'Рядом с формами нет ссылки на политику',
    why: 'Политика на сайте есть, но на некоторых страницах с формами на неё нет ссылки. А закон требует, чтобы она была доступна именно там, где собирают данные (ч. 2 ст. 18.1 152-ФЗ).',
    fix: 'Добавьте ссылку на политику в подвал этих страниц и рядом с формой.',
    short: 'на страницах с формами нет ссылки на политику',
  },
  no_deletion_info: {
    group: 'pd', severity: 'medium',
    title: 'Не написано, как удалить свои данные',
    why: 'В политике нет понятного способа отозвать согласие или попросить удалить данные. А человек вправе сделать это в любой момент (ст. 9 и ст. 21 152-ФЗ), и он должен знать, куда написать.',
    fix: 'Добавьте в политику и в согласие короткий раздел: «Чтобы отозвать согласие или удалить свои данные, напишите на почту такую-то». На такие запросы нужно отвечать в течение 10 рабочих дней.',
    short: 'в политике не написано, как отозвать согласие и удалить данные',
  },
  no_consent: {
    group: 'pd', severity: 'high',
    title: 'Формы собирают данные без согласия',
    why: 'Чтобы обрабатывать данные из заявки, обычно нужно согласие человека (ст. 9 152-ФЗ). С 1 сентября 2025 года оно должно быть конкретным, понятным и оформленным отдельно от других документов.',
    fix: 'Добавьте в каждую форму обязательную галочку без отметки по умолчанию: «Я даю согласие на обработку персональных данных» со ссылкой на текст согласия.',
    tilda: 'В Tilda добавьте в форму поле «Чекбокс», сделайте его обязательным, не ставьте галочку заранее и добавьте в подпись ссылку на согласие.',
    short: 'форма «{fields}» {where} собирает данные без согласия на обработку',
  },
  consent_passive: {
    group: 'pd', severity: 'medium',
    title: 'Согласие дано одной фразой под кнопкой',
    why: 'Фраза «Нажимая кнопку, вы соглашаетесь…» - слабое согласие: человек мог её просто не заметить. С 1 сентября 2025 года согласие нужно оформлять отдельно и однозначно, надёжнее всего - галочкой.',
    fix: 'Замените фразу на обязательную галочку, которая не стоит заранее, и дайте рядом ссылку на текст согласия.',
    tilda: 'В Tilda добавьте в форму обязательное поле «Чекбокс» без отметки по умолчанию, а фразу «Нажимая на кнопку…» уберите.',
    short: 'в форме «{fields}» согласие оформлено фразой «нажимая кнопку…», без галочки',
  },
  consent_prechecked: {
    group: 'pd', severity: 'medium',
    title: 'Галочка согласия уже стоит',
    why: 'Согласие должно быть осознанным (ст. 9 152-ФЗ). Если галочка стоит заранее, нельзя сказать, что человек действительно согласился.',
    fix: 'Уберите отметку по умолчанию и сделайте галочку обязательной для отправки формы.',
    tilda: 'В Tilda в настройках поля «Чекбокс» отключите отметку по умолчанию и сделайте поле обязательным.',
    getcourse: 'В GetCourse отметка по умолчанию может стоять и в настройках формы, и в общих настройках аккаунта для галочек согласия. Проверьте оба места и уберите повторяющиеся галочки.',
    short: 'в форме «{fields}» галочка согласия уже стоит заранее',
  },
  consent_combined: {
    group: 'pd', severity: 'medium',
    title: 'Согласие склеено с офертой',
    why: 'Одной галочкой человек и принимает оферту, и даёт согласие на обработку данных. С 1 сентября 2025 года согласие нужно оформлять отдельно от других документов (ст. 9 152-ФЗ).',
    fix: 'Сделайте две отдельные галочки: «Принимаю условия оферты» и «Даю согласие на обработку персональных данных» со ссылкой на текст согласия.',
    getcourse: 'В GetCourse такая формулировка часто стоит в общей галочке платформы. Замените её на два отдельных пункта.',
    short: 'в форме «{fields}» согласие на обработку склеено с принятием оферты',
  },
  no_consent_doc: {
    group: 'pd', severity: 'medium',
    title: 'Нет отдельного текста согласия',
    why: 'С 1 сентября 2025 года согласие на обработку данных оформляется отдельно от политики, оферты и пользовательского соглашения. Одной ссылки на политику в форме уже мало.',
    fix: 'Подготовьте отдельный документ «Согласие на обработку персональных данных»: кто обрабатывает, какие данные, зачем, что с ними делают, сколько хранят и как отозвать согласие. Поставьте ссылку на него у каждой формы.',
    short: 'нет отдельного текста согласия, а с 1 сентября 2025 года он обязателен',
  },
  excess_data: {
    group: 'pd', severity: 'medium',
    title: 'Форма просит лишние данные',
    why: 'Собирать можно только то, что правда нужно для дела (ст. 5 152-ФЗ). А форма просит: {what}. Если это обычная заявка, такие данные - лишний риск: чем больше храните, тем серьёзнее последствия, если они утекут.',
    fix: 'Оставьте в форме минимум: имя и способ связи. Остальное спросите потом, когда это действительно понадобится.',
    short: 'форма «{fields}» просит лишние данные: {what}',
  },
  children_consent: {
    group: 'pd', severity: 'medium',
    title: 'Нет согласия родителей на данные детей',
    why: 'Похоже, вы работаете с детьми (на сайте есть «{hint}»), а в формах и в согласии не сказано, что его даёт родитель или законный представитель. Данные ребёнка обрабатывают с согласия взрослого, который за него отвечает.',
    fix: 'Добавьте в форму и в текст согласия формулировку: «Я, родитель (законный представитель), даю согласие на обработку персональных данных ребёнка».',
    short: 'вы работаете с детьми, но в согласии ничего не сказано о родителях',
  },
  foreign_forms: {
    group: 'pd', severity: 'high',
    title: 'Заявки уходят в иностранный сервис',
    why: 'Данные граждан России при сборе нужно сначала записывать в базы данных в России (ч. 5 ст. 18 152-ФЗ). А {services} хранят ответы на зарубежных серверах.',
    fix: 'Перенесите сбор заявок во встроенные формы сайта или в российский сервис.',
    tilda: 'В Tilda замените ссылку на внешнюю форму обычным блоком формы Tilda.',
    short: 'заявки собираются через {services}, и данные хранятся за рубежом',
  },
  foreign_services: {
    group: 'pd', severity: 'medium',
    title: 'Подключены зарубежные сервисы',
    why: '{services} получают данные посетителей (IP-адрес, cookie, действия на сайте) на зарубежных серверах. Это может считаться трансграничной передачей данных: о ней нужно заранее сообщить в Роскомнадзор (ст. 12 152-ФЗ) и написать в политике.{meta}',
    fix: 'Уберите лишнее или замените российскими аналогами: Google Analytics на Яндекс Метрику, reCAPTCHA на Yandex SmartCaptcha, Google Fonts и CDN на файлы с вашего сервера, YouTube на VK Видео или Rutube. Если сервис нужен, подайте уведомление о трансграничной передаче и упомяните её в политике.',
    short: 'подключены {services}, а это трансграничная передача данных, о которой нужно уведомлять Роскомнадзор',
  },
  third_party_many: {
    group: 'pd', severity: 'low',
    title: 'Много сторонних сервисов',
    why: 'На сайте работают {count} сторонних сервисов. Каждый из них получает данные посетителей, поэтому их нужно перечислить в политике. Лишние скрипты к тому же замедляют сайт.',
    fix: 'Пройдитесь по списку в конце отчёта: уберите то, чем не пользуетесь, а оставшееся опишите в политике.',
    short: 'на сайте {count} сторонних сервисов, которые получают данные посетителей',
  },
  webvisor: {
    group: 'pd', severity: 'medium',
    title: 'Вебвизор записывает действия посетителей',
    why: 'Вебвизор Яндекс Метрики записывает всё, что люди делают на сайте, включая ввод в формы. Это обработка персональных данных, и о ней нужно написать в политике.',
    fix: 'Упомяните Метрику и Вебвизор в политике и согласии или отключите запись содержимого полей в настройках счётчика.',
    short: 'включён Вебвизор, который записывает ввод в формы',
  },

  // --- Cookie ---
  cookies_no_notice: {
    group: 'cookie', severity: 'low',
    title: 'Нет баннера о cookie',
    why: 'Сервисы аналитики сразу ставят cookie ({cookies}), а посетителя об этом никак не предупреждают. Cookie вместе с IP-адресом могут считаться персональными данными, поэтому лучше честно об этом сказать.',
    fix: 'Добавьте небольшую плашку: «Мы используем cookie для аналитики» со ссылкой на политику и кнопкой «Понятно».',
    tilda: 'В Tilda есть готовый блок с уведомлением о cookie: найдите его в библиотеке блоков по слову «cookie».',
    short: 'сайт ставит cookie, но не предупреждает об этом посетителей',
  },
  no_cookie_policy: {
    group: 'cookie', severity: 'low',
    title: 'Нигде не объяснено, какие cookie использует сайт',
    why: 'Сайт ставит cookie, но ни отдельной политики cookie, ни раздела о них в политике мы не нашли. Посетитель должен понимать, что именно сохраняется и зачем.',
    fix: 'Добавьте в политику раздел про cookie или сделайте отдельную страницу: какие cookie, для чего и как их отключить.',
    short: 'нигде не объяснено, какие cookie использует сайт',
  },

  // --- Продажи, реклама и отзывы ---
  no_offer: {
    group: 'commerce', severity: 'medium',
    title: 'Нет оферты',
    why: 'На сайте можно купить, а условия сделки найти нельзя. Покупатель должен заранее видеть, что именно он покупает, на каких условиях и как всё будет происходить (ст. 437 ГК РФ, ст. 10 закона «О защите прав потребителей»).',
    fix: 'Выложите оферту отдельной страницей и поставьте ссылку на неё рядом с кнопкой оплаты и в подвале.',
    short: 'на сайте можно оплатить, но нет оферты с условиями',
  },
  no_refund: {
    group: 'commerce', severity: 'medium',
    title: 'Не описано, как вернуть деньги',
    why: 'Покупатель может отказаться от услуги и вернуть деньги за то, что ещё не получил (ст. 32 закона «О защите прав потребителей»). Когда правила возврата не написаны, люди сомневаются перед покупкой, а споры чаще превращаются в жалобы.',
    fix: 'Добавьте понятный раздел «Возврат денег»: куда написать, в какой срок вернёте и что удерживается. Можно внутри оферты, но лучше дать отдельную ссылку.',
    short: 'не написано, как вернуть деньги',
  },
  hidden_paid_option: {
    group: 'commerce', severity: 'medium',
    title: 'Платная опция включена заранее',
    why: 'В форме уже стоит галочка за дополнительную плату: {labels}. Навязывать платные дополнительные услуги без явного согласия покупателя нельзя (ст. 16 закона «О защите прав потребителей»).',
    fix: 'Снимите отметку по умолчанию: пусть человек сам решит, нужна ли ему эта опция.',
    short: 'в форме заранее включена платная опция',
  },
  autorenew_unclear: {
    group: 'commerce', severity: 'low',
    title: 'Не видно условий автопродления',
    why: 'На сайте есть предложение «{offer}», но мы не нашли, что будет дальше: спишутся ли деньги автоматически и как отменить подписку. Если списания есть, о них нужно сказать прямо и до оплаты.',
    fix: 'Рядом с кнопкой оплаты напишите простыми словами: сколько и когда спишется после пробного периода и как отключить автопродление.',
    short: 'есть предложение «{offer}», но не видно условий автопродления',
  },
  dark_timer: {
    group: 'commerce', severity: 'medium',
    title: 'Таймер акции ненастоящий',
    why: 'Мы открыли сайт дважды как новый посетитель, и таймер оба раза начал отсчёт заново. Значит, срок акции выдуманный. Это давление на покупателя, и такая реклама может считаться недостоверной (ст. 5 закона «О рекламе»).',
    fix: 'Поставьте честный срок акции или уберите таймер.',
    short: 'таймер акции обнуляется при каждом заходе, то есть срок ненастоящий',
  },
  dark_patterns: {
    group: 'commerce', severity: 'low',
    title: 'Есть приёмы давления на покупателя',
    why: 'Нашли формулировки: {examples}. Если «осталось 3 места» или «только сегодня» не соответствует действительности, это недостоверная реклама (ст. 5 закона «О рекламе»). А кнопки вроде «Нет, я не хочу развиваться» просто раздражают людей.',
    fix: 'Оставьте только правду: настоящие сроки и настоящее число мест. Кнопку отказа назовите спокойно, например «Нет, спасибо».',
    short: 'на сайте есть приёмы давления: {first}',
  },
  empty_promises: {
    group: 'commerce', severity: 'low',
    title: 'Громкие обещания без подтверждения',
    why: 'Нашли фразы: {examples}. Слова «лучший», «№1», «гарантия результата» или «заработок от 100 000» в рекламе нужно уметь подтвердить исследованием, договором или статистикой. Иначе это недостоверная реклама (ст. 5 закона «О рекламе»), и после жалобы ФАС может выписать штраф.',
    fix: 'Уберите то, что не можете доказать, или добавьте рядом подтверждение: откуда рейтинг, какие условия гарантии в договоре.',
    short: 'на сайте есть громкие обещания без подтверждения: {first}',
  },
  reviews_duplicates: {
    group: 'commerce', severity: 'low',
    title: 'Повторяющиеся отзывы',
    why: 'Некоторые отзывы на сайте совпадают слово в слово. Так выглядят выдуманные отзывы, и это подрывает доверие. А выдуманные отзывы в рекламе - это недостоверная реклама (ст. 5 закона «О рекламе»).',
    fix: 'Оставьте только настоящие отзывы. Ещё лучше - дайте ссылки на отзывы на независимых площадках: Яндекс Картах, 2ГИС, Отзовике.',
    short: 'на сайте есть повторяющиеся отзывы',
  },
  ad_prechecked: {
    group: 'commerce', severity: 'medium',
    title: 'Галочка согласия на рекламу уже стоит',
    why: 'Присылать рекламу (звонки, сообщения, письма) можно только тем, кто сам на это согласился (ч. 1 ст. 18 закона «О рекламе»). Галочка, которая стоит заранее, - сомнительное согласие: если получатель пожалуется, ФАС может признать рассылку незаконной.',
    fix: 'Уберите отметку по умолчанию, пусть человек ставит её сам. И держите согласие на рекламу отдельно от согласия на обработку данных.',
    tilda: 'В Tilda в настройках поля «Чекбокс» отключите отметку по умолчанию.',
    getcourse: 'В GetCourse отметка по умолчанию может стоять и в настройках формы, и в общих настройках аккаунта для галочек согласия. Проверьте оба места и уберите повторяющиеся галочки.',
    short: 'в форме «{fields}» галочка согласия на рекламную рассылку уже стоит',
  },
  no_unsubscribe: {
    group: 'commerce', severity: 'low',
    title: 'Непонятно, как отписаться от рассылки',
    why: 'На сайте можно подписаться на рассылку, но нигде не сказано, как от неё отказаться. Человек вправе в любой момент отказаться от рекламы, и рассылку нужно сразу прекратить (ст. 18 закона «О рекламе»).',
    fix: 'Напишите рядом с формой подписки и в политике: «Отписаться можно по ссылке в любом письме». И проверьте, что такая ссылка правда есть в каждом письме.',
    short: 'не сказано, как отписаться от рассылки',
  },
  no_requisites: {
    group: 'commerce', severity: 'low',
    title: 'Не указаны реквизиты компании',
    why: 'Покупатель должен знать, с кем имеет дело: закон «О защите прав потребителей» требует указывать название и адрес продавца (ст. 9). ИНН и ОГРН рядом с ними помогают проверить компанию и вызывают больше доверия.',
    fix: 'Укажите название (или ФИО ИП), ИНН и ОГРН (ОГРНИП) в подвале сайта и в политике.',
    short: 'на сайте не указаны реквизиты компании (ИНН, ОГРН)',
  },

  // --- Удобство для всех ---
  img_no_alt: {
    group: 'a11y', severity: 'low',
    title: 'У картинок нет описания',
    why: 'На главной {count} из {total} картинок без описания (alt). Незрячие посетители, которые слушают сайт через экранного диктора, не узнают, что на них, а поисковики хуже понимают страницу.',
    fix: 'Добавьте каждой содержательной картинке короткое описание в атрибут alt. Для чисто декоративных можно оставить пустой alt.',
    tilda: 'В Tilda описание задаётся в настройках картинки, в поле alt (описание изображения).',
    short: '{count} картинок без описания для незрячих и поисковиков',
  },
  low_contrast: {
    group: 'a11y', severity: 'low',
    title: 'Текст местами плохо читается',
    why: 'Нашли {count} мест, где текст почти сливается с фоном. Например, «{example}»: контраст {ratio}:1 при норме не ниже 4,5:1. Людям со слабым зрением и всем, кто читает с телефона на солнце, такой текст трудно разобрать.',
    fix: 'Сделайте текст темнее или фон светлее, чтобы контраст был не ниже 4,5:1 (для крупных заголовков хватит 3:1). Проверить можно в любом онлайн-калькуляторе контраста.',
    short: 'местами текст сливается с фоном',
  },
  keyboard_nav: {
    group: 'a11y', severity: 'low',
    title: 'Сайтом сложно пользоваться без мыши',
    why: 'Не все могут пользоваться мышью: кто-то работает только с клавиатуры или через экранного диктора. Если по сайту нельзя пройти клавишей Tab или не видно, где сейчас фокус, такие люди не смогут оставить заявку.',
    fix: 'Делайте кнопки настоящими кнопками и ссылками (теги button и a), а не блоками с обработчиком клика, и не убирайте рамку фокуса.',
    short: 'по сайту трудно пройти клавишей Tab',
  },

  // --- Лицензии ---
  stock_hotlink: {
    group: 'license', severity: 'medium',
    title: 'Фото загружаются прямо со стоков',
    why: 'Часть картинок грузится напрямую с фотостоков ({hosts}). Обычно так выглядят превью без лицензии. За чужое фото без лицензии автор или сток может потребовать компенсацию от 10 тыс. до 5 млн ₽ (ст. 1301 ГК РФ).',
    fix: 'Купите лицензию или замените фото на свои либо бесплатные (например, с Unsplash или Pexels). Файлы храните у себя на сайте.',
    short: 'фото загружаются прямо с фотостоков, похоже на использование без лицензии',
  },
  stock_names: {
    group: 'license', severity: 'low',
    title: 'Проверьте лицензии на фото',
    why: 'По названиям файлов видно, что фото со стоков: {files}. Если лицензия куплена, всё в порядке. Если фото просто скачаны, это нарушение авторских прав (компенсация от 10 тыс. до 5 млн ₽, ст. 1301 ГК РФ).',
    fix: 'Найдите подтверждение покупки (чек или лицензию в кабинете стока) и сохраните его. Если подтверждения нет, замените фото.',
    short: 'на сайте фото со стоков, стоит проверить лицензии',
  },
  paid_fonts: {
    group: 'license', severity: 'low',
    title: 'Проверьте лицензии на шрифты',
    why: 'На сайте используются платные шрифты: {fonts}. Для сайта нужна именно веб-лицензия.{note}',
    fix: 'Найдите документ о покупке веб-лицензии. Если его нет, купите лицензию или замените шрифт бесплатным: Inter, Montserrat, Manrope, Golos и другие.',
    short: 'на сайте платные шрифты, стоит проверить лицензию',
  },
};

// ---------- Вспомогательные функции ----------

const safeUrl = (s) => { try { return new URL(s); } catch (e) { return null; } };
const stripWww = (x) => String(x || '').replace(/^www\./i, '').toLowerCase();
const hostOf = (s) => { const u = safeUrl(s); return u ? stripWww(u.hostname) : String(s || ''); };
const withoutHash = (s) => { const u = safeUrl(s); if (!u) return s; u.hash = ''; return u.href; };
const uniq = (arr) => [...new Set(arr)];
const fill = (tpl, vars) => (tpl == null ? null : String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : '')));
const quote = (s) => `«${s}»`;
const cut = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const part = t.slice(0, n);
  const sp = part.lastIndexOf(' ');
  return (sp > n * 0.5 ? part.slice(0, sp) : part) + '…';
};
const decodeSafe = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

function baseDomain(host) {
  const parts = stripWww(host).split('.');
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIX.has(last2) ? parts.slice(-3).join('.') : last2;
}
const sameSite = (h1, h2) => baseDomain(h1) === baseDomain(h2);

// «Сайт» для отчётов: хост и путь (чтобы различать, например, несколько проектов на github.io).
function siteLabel(url) {
  const u = safeUrl(url);
  if (!u) return String(url || '');
  const path = u.pathname.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
  return stripWww(u.hostname) + path;
}

// homeUrl - адрес, с которого начали проверку: он считается «главной страницей».
function pageLabel(url, homeUrl) {
  const u = safeUrl(url);
  if (!u) return String(url);
  const hu = safeUrl(homeUrl);
  const trim = (x) => x.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '');
  // Начальный адрес считаем главной, только если он похож на корень сайта или раздела (кончается на «/»).
  // Если проверку начали со страницы курса (/kurs), так её и называем.
  const startIsRoot = hu && /\/(index\.html?)?$/i.test(hu.pathname);
  if (u.pathname === '/' || (startIsRoot && trim(u.pathname) === trim(hu.pathname))) return 'главная страница';
  const p = decodeSafe(u.pathname);
  return p.length > 60 ? p.slice(0, 57) + '…' : p;
}

function wherePage(url, homeUrl) {
  const l = pageLabel(url, homeUrl);
  return l === 'главная страница' ? 'на главной странице' : 'на странице ' + l;
}

// Тип ссылки на документ: consent, policy, cookie, refund, offer или null.
// Для чужих доменов судим только по тексту ссылки: адрес вроде yandex.ru/legal/... не политика сайта.
function linkKind(l, siteHost) {
  const u = safeUrl(l.href);
  const path = u ? decodeSafe(u.pathname + u.hash) : '';
  const text = l.text || '';
  const own = !siteHost || !u || sameSite(u.hostname, siteHost);
  if (/(реклам|рассылк)/i.test(text)) return null; // согласие на рекламу - не про обработку персональных данных
  // «Условия использования» Яндекс Карт или оферта платёжного сервиса - это чужие документы, а не документы сайта.
  if (!own && u && isThirdPartyLegal(u)) return null;
  // Сначала смотрим на текст ссылки: он точнее адреса («Политика» по адресу /terms-of-use/4 - это политика, а не оферта).
  const byText = docKind(text);
  if (byText) return byText;
  if (!own) return null;
  return docKind(path) || (HUB_RE.test(text.trim() + ' ' + path) ? 'policy' : null);
}

// Правовые страницы крупных сервисов. Файлы на облачных дисках (там владельцы часто хранят свои документы) сюда не входят.
const BIG_SERVICE_RE = /(^|\.)(yandex\.(ru|com|net)|ya\.ru|google\.[a-z.]+|vk\.com|vk\.ru|telegram\.org|whatsapp\.com|apple\.com|microsoft\.com|cloudpayments\.ru|yookassa\.ru|yoomoney\.ru|robokassa\.(ru|com)|tinkoff\.ru|tbank\.ru|sberbank\.ru|prodamus\.ru|payform\.ru|2gis\.(ru|com)|jivo\.ru|jivosite\.com|mail\.ru|ok\.ru|rutube\.ru|youtube\.com|facebook\.com|instagram\.com|cloudflare\.com)$/i;
const STORAGE_RE = /^(disk\.yandex\.[a-z.]+|yadi\.sk|docs\.google\.com|drive\.google\.com|cloud\.mail\.ru)$/i;
const PLATFORM_ROOTS = new Set(['getcourse.ru', 'getcourse.io', 'tilda.cc', 'tilda.ru', 'taplink.cc', 'wordpress.org', 'wordpress.com']);
function isThirdPartyLegal(u) {
  const host = stripWww(u.hostname);
  if (STORAGE_RE.test(host)) return false;
  return PLATFORM_ROOTS.has(host) || BIG_SERVICE_RE.test(host);
}

function docKind(s) {
  if (CONSENT_DOC_RE.test(s) && !COOKIE_DOC_RE.test(s)) return 'consent';
  if (POLICY_PD_RE.test(s)) return 'policy';
  if (COOKIE_DOC_RE.test(s)) return 'cookie';
  if (REFUND_RE.test(s)) return 'refund';
  if (OFFER_RE.test(s)) return 'offer';
  if (POLICY_RE.test(s)) return 'policy';
  return null;
}

function isPopupLink(l, pageUrl) {
  if ((l.raw || '').startsWith('#')) return true;
  const u = safeUrl(l.href);
  return !!(u && u.hash && withoutHash(l.href) === withoutHash(pageUrl));
}

function docKey(l, pageUrl) {
  return isPopupLink(l, pageUrl) ? 'popup:' + (safeUrl(l.href) || { hash: l.raw }).hash : withoutHash(l.href);
}

const DOC_KINDS = ['policy', 'consent', 'cookie', 'offer', 'refund'];
const STRONG_DOC_WORDS = {
  policy: /(персональн|конфиденц|privacy|personal)/i,
  consent: /(согласи)/i,
  cookie: /(cookie|куки)/i,
  offer: /(оферт|договор)/i,
  refund: /(возврат)/i,
};

// Кандидаты на документы. Их потом скачивают и проверяют в scan.js.
function docCandidates(pages) {
  const out = Object.fromEntries(DOC_KINDS.map((k) => [k, new Map()]));
  const first = pages.find((p) => p.data);
  const siteHost = first ? hostOf(first.url) : null;
  for (const p of pages) {
    if (!p.data) continue;
    for (const l of p.data.links) {
      const kind = linkKind(l, siteHost);
      if (!kind || !/^https?:/i.test(l.href)) continue;
      const key = docKey(l, p.url);
      const score = STRONG_DOC_WORDS[kind].test(l.text + ' ' + l.href) ? 2 : (l.text || '').length > 2 ? 1 : 0;
      const prev = out[kind].get(key);
      if (!prev || prev.score < score) out[kind].set(key, { href: l.href, key, score, popup: isPopupLink(l, p.url) });
    }
  }
  const sorted = (m) => [...m.values()].sort((a, b) => b.score - a.score);
  return Object.fromEntries(DOC_KINDS.map((k) => [k, sorted(out[k])]));
}

// Галочки: согласие на обработку данных, реклама или платная опция.
const isPaidBox = (c) => !PD_WORDS_RE.test(c.label) && ((MONEY_RE.test(c.label) && ADDON_RE.test(c.label)) || /(автопродл|доплат)/i.test(c.label));
const isPdBox = (c) => PD_WORDS_RE.test(c.label) || (/соглас/i.test(c.label) && !AD_WORDS_RE.test(c.label) && !PAID_STRONG_RE.test(c.label));
const isAdBox = (c) => !isPdBox(c) && !isPaidBox(c) && AD_WORDS_RE.test(c.label);
// Если в форме есть видимые галочки, оцениваем только их (скрытые бывают служебными копиями).
// Если видимых нет (форма в закрытом попапе), а одна подпись повторяется с разным состоянием,
// мы не знаем, какую копию увидит человек, и считаем галочку неотмеченной: лучше пропустить, чем обвинить зря.
function shownBoxes(f) {
  if (f.checkboxes.some((c) => c.visible)) return f.checkboxes.filter((c) => c.visible);
  const byLabel = new Map();
  for (const c of f.checkboxes) {
    const g = byLabel.get(c.label);
    if (!g) byLabel.set(c.label, { ...c });
    else if (g.checked !== c.checked) g.checked = false;
  }
  return [...byLabel.values()];
}
const COMBINED_RE = /(оферт|пользовательск\S*\s+соглашени|договор|правил\S*\s+(пользован|сайт|платформ|сервис))/i;

function consentType(f) {
  const all = shownBoxes(f);
  let boxes = all.filter(isPdBox);
  if (!boxes.length) {
    // Галочка без подписи (подпись нарисована рядом картинкой или стилями): смотрим на текст формы.
    const unlabeled = all.filter((c) => !isAdBox(c) && !isPaidBox(c) && c.label.length < 3);
    if (unlabeled.length === 1 && PD_WORDS_RE.test(f.formText)) boxes = unlabeled;
  }
  if (boxes.length) return boxes.some((c) => c.checked) ? 'prechecked' : 'checkbox';
  let text = f.formText + ' ' + f.blockText;
  for (const c of all.filter((x) => isAdBox(x) || isPaidBox(x))) text = text.split(c.label).join(' ');
  if (PASSIVE_RE.test(text)) return 'passive';
  if (/(согласи[еяю]\s+на\s+обработку|обработк\S*\s+персональн)/i.test(text)) return 'passive';
  return 'none';
}

const adPrechecked = (f) => shownBoxes(f).some((c) => isAdBox(c) && c.checked);
// В форме повторяются одинаковые галочки, и часть уже отмечена (типично для GetCourse: свои галочки плюс общие галочки платформы).
const duplicateMixed = (f) => {
  const m = new Map();
  for (const c of shownBoxes(f)) { const g = m.get(c.label) || []; g.push(c.checked); m.set(c.label, g); }
  return [...m.values()].some((g) => g.length > 1 && g.includes(true) && g.includes(false));
};
// Одна галочка и «принимаю оферту», и «согласен на обработку персональных данных».
const consentCombined = (f) => shownBoxes(f).some((c) => PD_WORDS_RE.test(c.label) && COMBINED_RE.test(c.label));

// Адреса сервисов, которые встречаются в коде страниц (карты, конструкторы, виджеты): это не контакты владельца.
const VENDOR_EMAIL_RE = /@([a-z0-9-]+\.)*(2gis\.(ru|com)|tilda\.(cc|ws)|tildacdn\.com|getcourse\.(ru|io)|sentry\.io|yandex-team\.ru|google\.com|w3\.org|schema\.org|wix\.com|jivosite\.com|jivo\.ru|bitrix24\.ru|amocrm\.ru|taplink\.cc|github\.com|wordpress\.org|example\.(com|ru|org))$/i;

function classifyEmails(emails, siteHost) {
  const clean = uniq(emails.map((e) => e.toLowerCase().trim()))
    .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !BAD_EMAIL_RE.test(e) && !VENDOR_EMAIL_RE.test(e));
  const own = (e) => (hostOf('http://' + e.split('@')[1]).endsWith(siteHost) ? 1 : 0);
  clean.sort((a, b) => own(b) - own(a));
  return {
    generic: clean.filter((e) => GENERIC_LOCAL_RE.test(e.split('@')[0])),
    other: clean.filter((e) => !GENERIC_LOCAL_RE.test(e.split('@')[0])),
  };
}

function detectPlatform(home) {
  if (home.data.isTilda) return 'Tilda';
  const res = home.data.resources.join(' ') + ' ' + home.data.generator;
  if (/wp-content|wp-includes|wordpress/i.test(res)) return 'WordPress';
  if (/\/bitrix\//i.test(res)) return '1С-Битрикс';
  if (/getcourse|gcdn\.co/i.test(res)) return 'GetCourse';
  if (/wixstatic|parastorage/i.test(res)) return 'Wix';
  if (/taplink/i.test(res)) return 'Taplink';
  if (/joomla/i.test(res)) return 'Joomla';
  if (/nethouse/i.test(res)) return 'Nethouse';
  if (/craftum/i.test(res)) return 'Craftum';
  return null;
}

function formLabel(f, homeUrl) {
  const where = f.pages.size > 1 ? `на ${f.pages.size} страницах` : wherePage(f.page, homeUrl);
  const frame = f.frameUrl ? `, во встроенном окне ${hostOf(f.frameUrl)}` : '';
  // Скрытую форму владельцу трудно найти глазами: подсказываем, что она открывается по кнопке.
  const hidden = f.visible ? '' : ', открывается по кнопке';
  return `«${f.fields.join(', ')}» (${where}${frame}${hidden})`;
}

// Короткие цитаты из текста по регулярному выражению (без повторов).
// ctx - сколько символов показать вокруг находки, чтобы владельцу сайта было проще найти фразу.
// Цитата не выходит за пределы строки и предложения и не обрывается посреди слова.
function snippets(re, text, max = 3, ctx = 0) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const stop = /[.!?\n]/;
  for (const m of text.matchAll(g)) {
    let from = m.index;
    let to = m.index + m[0].length;
    if (ctx) {
      let a = from;
      while (a > 0 && from - a < ctx && !stop.test(text[a - 1])) a--;
      if (a > 0 && !stop.test(text[a - 1])) { const sp = text.indexOf(' ', a); a = sp !== -1 && sp < from ? sp + 1 : from; }
      let b = to;
      while (b < text.length && b - to < ctx && !stop.test(text[b])) b++;
      if (b < text.length && !stop.test(text[b])) { const sp = text.lastIndexOf(' ', b); b = sp > to ? sp : to; }
      from = a;
      to = b;
    }
    const s = text.slice(from, to).replace(/\s+/g, ' ').trim().slice(0, 110);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const ratioText = (r) => String(r).replace('.', ',');

// ---------- Главная функция ----------

/**
 * scan = {
 *   input, startUrl, scannedAt,
 *   pages: [{ url, status, data, error }],  // data - результат extractPageData
 *   cookies: [{ name, domain }],
 *   requests: [url, ...],
 *   docs: { [key]: { ok, status, error, reqText, mentions } },
 *   keyboard: { distinct, visibleFocused, noOutline } | null,  // проверка клавишей Tab на главной
 *   timer: { evergreen, first, second, delta } | null,         // повторный заход для таймера
 * }
 */
function analyze(scan) {
  const okPages = scan.pages.filter((p) => p.data);
  const home = okPages[0];
  const result = {
    input: scan.input,
    startUrl: scan.startUrl,
    finalUrl: home ? home.url : scan.startUrl,
    domain: hostOf(home ? home.url : scan.startUrl),
    site: siteLabel(home ? home.url : scan.startUrl),
    scannedAt: scan.scannedAt,
    ok: !!home,
    error: home ? null : ((scan.pages[0] && scan.pages[0].error) || scan.error || 'сайт не открылся'),
    title: home ? home.data.title : '',
    platform: null,
    pagesScanned: okPages.map((p) => p.url),
    forms: [],
    findings: [],
    info: [],
    checklist: [],
    inventory: { ru: [], foreign: [], other: [] },
    requisites: { inn: [], ogrn: [] },
    emails: { generic: [], other: [] },
    foreign: [],
    foreignForms: [],
    counts: { high: 0, medium: 0, low: 0 },
    score: 0,
    documents: [],
    signals: {},
  };
  if (!home) return result;

  result.platform = detectPlatform(home);
  const isTilda = result.platform === 'Tilda';
  const isGetCourse = result.platform === 'GetCourse';
  const allText = okPages.map((p) => p.data.visibleText || '').join('\n').slice(0, 160000);

  // --- Формы с персональными данными (одинаковые формы на разных страницах склеиваем) ---
  const pdForms = [];
  const seen = new Map();
  const paidLabels = new Set();
  for (const p of okPages) {
    for (const f of p.data.forms) {
      for (const c of shownBoxes(f)) if (c.checked && isPaidBox(c)) paidLabels.add(cut(c.label, 80));
      if (!f.pdCount || !f.fields.some((k) => STRONG_KINDS.has(k))) continue;
      // Форма входа (логин и пароль) - не заявка: согласие в ней не ищем.
      if (f.hasPassword && f.fields.length <= 1) continue;
      const consent = consentType(f);
      const adPre = adPrechecked(f);
      const combined = consentCombined(f);
      const key = f.fields.join(',') + '|' + consent + '|' + adPre + '|' + combined + '|' + (f.frameUrl ? hostOf(f.frameUrl) : '');
      if (seen.has(key)) { seen.get(key).pages.add(p.url); continue; }
      const entry = {
        fields: f.fields, consent, adPre, combined, dupMixed: duplicateMixed(f),
        hasAdBox: shownBoxes(f).some(isAdBox), fieldCount: f.fieldCount,
        text: (f.formText + ' ' + f.blockText).slice(0, 30000),
        page: p.url, pages: new Set([p.url]), frameUrl: f.frameUrl || null, visible: f.visible,
      };
      seen.set(key, entry);
      pdForms.push(entry);
    }
  }
  result.forms = pdForms.map((f) => ({ fields: f.fields, consent: f.consent, adPrechecked: f.adPre, page: f.page, pages: [...f.pages], frameUrl: f.frameUrl }));
  const allFields = uniq(pdForms.flatMap((f) => f.fields));
  const fieldsText = allFields.length ? allFields.join(', ') : 'контактные данные';

  // --- Документы ---
  const cands = docCandidates(okPages);
  const docs = scan.docs || {};
  const docOk = (c) => c.popup || (docs[c.key] && docs[c.key].ok);
  const okDocs = (kind) => cands[kind].filter((c) => !c.popup).map((c) => docs[c.key]).filter((d) => d && d.ok);
  // says: в документе прямо сказано. silent: есть полноценный текст, но об этом ни слова. Иначе - не знаем (PDF, попап, SPA).
  const says = (kinds, k) => kinds.some((kind) => okDocs(kind).some((d) => d.mentions && d.mentions[k] === true));
  const silent = (kinds, k) => !says(kinds, k) && kinds.some((kind) => okDocs(kind).some((d) => d.mentions && d.mentions[k] === false));
  const anyDoc = (kinds) => kinds.some((kind) => cands[kind].some(docOk));
  // Точно не сказано: либо в прочитанном тексте нет, либо документов нет вовсе.
  const knownAbsent = (kinds, k) => !says(kinds, k) && (silent(kinds, k) || !anyDoc(kinds));

  const policyOk = cands.policy.some(docOk);
  const policyKeys = new Set(cands.policy.map((c) => c.key));
  const consentDocOk = cands.consent.some((c) => docOk(c) && !policyKeys.has(c.key));
  result.documents = DOC_KINDS.flatMap((kind) => cands[kind].slice(0, 3).map((c) => ({ kind, ...c }))).map((c) => {
    const d = docs[c.key];
    return { kind: c.kind, href: c.href, popup: c.popup, checked: !!d, ok: d ? d.ok : null, status: d ? d.status : null, mentions: d ? d.mentions : null };
  });

  // --- Реквизиты и контакты ---
  const reqSources = okPages.flatMap((p) => p.data.reqText);
  for (const d of Object.values(docs)) if (d && d.reqText) reqSources.push(...d.reqText);
  result.requisites = extractRequisites(reqSources);
  result.emails = classifyEmails(okPages.flatMap((p) => p.data.emails), result.domain);

  // --- Сторонние сервисы ---
  const allUrls = uniq([...(scan.requests || []), ...okPages.flatMap((p) => p.data.resources)]).map(safeUrl).filter(Boolean);
  const resUrls = allUrls.filter((u) => /^https?:$/.test(u.protocol) && !sameSite(u.hostname, result.domain));
  const linkUrls = uniq(okPages.flatMap((p) => p.data.links.map((l) => l.href))).map(safeUrl).filter(Boolean);
  const found = new Map();
  const unknown = new Set();
  for (const u of resUrls) {
    const host = stripWww(u.hostname);
    if (PLATFORM_HOSTS_RE.test(host)) continue;
    const svc = SERVICES.find((s) => s.test(u));
    if (svc) { if (!(svc.kind === 'platform' && isGetCourse)) found.set(svc.name, svc); continue; }
    unknown.add(baseDomain(host));
  }
  const services = [...found.values()];
  const foreign = services.filter((s) => s.foreign);
  const foreignForms = FOREIGN_FORMS.filter((s) => resUrls.some((u) => s.test(u)) || linkUrls.some((u) => s.test(u)));
  result.foreign = foreign.map((s) => s.name);
  result.foreignForms = foreignForms.map((s) => s.name);
  result.inventory = {
    ru: services.filter((s) => !s.foreign).map((s) => s.name),
    foreign: foreign.map((s) => s.name),
    other: [...unknown].slice(0, 15),
  };
  const thirdCount = services.length + unknown.size;

  // --- Прочие сигналы ---
  const analyticsCookies = uniq((scan.cookies || []).map((c) => c.name).filter((n) => ANALYTICS_COOKIE_RE.test(n)));
  const cookieBanner = okPages.some((p) => p.data.cookieBanner);
  const webvisor = okPages.some((p) => p.data.webvisor);
  const https = home.data.protocol === 'https:';
  const payHosts = resUrls.filter((u) => PAY_HOSTS_RE.test(stripWww(u.hostname)));
  const commerce = payHosts.length > 0 || (PRICE_RE.test(allText) && BUY_RE.test(allText));
  // «Работаем с детьми» засчитываем только по явным признакам: возраст учеников, тема в заголовке
  // или несколько «детских» слов сразу. Один пункт меню «Для детей» у большого каталога - не повод.
  const ageMatch = AGE_RE.exec(allText);
  const childStrong = CHILD_STRONG_RE.exec(allText);
  const childWords = uniq((allText.match(CHILD_WORDS_RE) || []).map((w) => w.toLowerCase()));
  const children = !!ageMatch || CHILD_STRONG_RE.test(home.data.title || '') || (!!childStrong && childWords.length >= 3);
  const subscription = pdForms.some((f) => (f.fields.includes('e-mail') && SUBSCRIBE_RE.test(f.text)) || f.hasAdBox);
  const trial = snippets(TRIAL_RE, allText, 1)[0];
  const hasReviews = okPages.some((p) => p.data.hasReviews);
  const dupReviews = okPages.reduce((s, p) => s + (p.data.duplicateReviews || 0), 0);
  result.signals = { commerce, children, subscription, trial: trial || null, hasReviews, thirdParty: thirdCount };

  // --- Замечания ---
  const findings = [];
  const add = (id, details, vars = {}, severity) => {
    const r = RULES[id];
    findings.push({
      id,
      group: r.group,
      severity: severity || r.severity,
      title: r.title,
      details: uniq(details),
      why: fill(r.why, vars),
      fix: fill(r.fix, vars),
      tip: isTilda && r.tilda ? fill(r.tilda, vars) : isGetCourse && r.getcourse ? fill(r.getcourse, vars) : null,
      short: fill(r.short, vars),
    });
  };
  const state = {}; // состояния для чек-листа

  // Персональные данные
  if (!https && pdForms.length) add('no_https', [`Адрес сайта: ${home.url}`]);

  if (pdForms.length) {
    if (!cands.policy.length) {
      // Правила обработки данных могут быть описаны внутри оферты: тогда пишем мягче и точнее.
      if (says(['offer'], 'pdSection')) {
        add('policy_inside_offer', ['Ссылки на отдельную политику нет, а в пользовательском соглашении (оферте) есть раздел о персональных данных.']);
      } else {
        add('no_policy', ['На просмотренных страницах нет ссылок на политику обработки персональных данных.'], { fields: fieldsText });
      }
    } else if (!policyOk) {
      const details = cands.policy.slice(0, 3).map((c) => {
        const d = docs[c.key];
        if (!d) return `${c.href}: не проверялась`;
        if (d.error) return `${c.href}: не открывается (${d.error})`;
        if (d.status >= 400) return `${c.href}: ошибка ${d.status}`;
        return `${c.href}: на странице нет текста о персональных данных`;
      });
      add('policy_broken', details);
    } else {
      const pdPages = uniq(pdForms.flatMap((f) => [...f.pages]));
      const missing = pdPages.filter((u) => {
        const p = okPages.find((x) => x.url === u);
        return p && !p.data.links.some((l) => linkKind(l, result.domain) === 'policy');
      });
      if (missing.length) add('policy_not_near_forms', missing.map((u) => `Нет ссылки ${wherePage(u, home.url)}.`));
    }

    if (policyOk) {
      if (says(['policy', 'consent'], 'deletion')) state.deletion = 'ok';
      else if (silent(['policy'], 'deletion')) {
        state.deletion = 'fail';
        add('no_deletion_info', ['В тексте политики нет слов об отзыве согласия, удалении или уничтожении данных.']);
      } else state.deletion = 'manual';
    } else state.deletion = 'fail';

    const none = pdForms.filter((f) => f.consent === 'none');
    const passive = pdForms.filter((f) => f.consent === 'passive');
    const pre = pdForms.filter((f) => f.consent === 'prechecked');
    if (none.length) {
      add('no_consent', none.map((f) => `Форма ${formLabel(f, home.url)}: нет ни галочки, ни слов о согласии на обработку данных.`),
        { fields: none[0].fields.join(', '), where: none[0].pages.size > 1 ? `на ${none[0].pages.size} страницах` : wherePage(none[0].page, home.url) });
    }
    if (passive.length) {
      add('consent_passive', passive.map((f) => `Форма ${formLabel(f, home.url)}: согласие только текстом, без галочки.`), { fields: passive[0].fields.join(', ') });
    }
    if (pre.length) {
      add('consent_prechecked', pre.map((f) => `Форма ${formLabel(f, home.url)}: ` + (f.dupMixed
        ? 'одинаковые галочки согласия повторяются, и одна из копий уже отмечена.'
        : 'галочка согласия стоит заранее.')), { fields: pre[0].fields.join(', ') });
    }
    const combined = pdForms.filter((f) => f.combined && f.consent !== 'none');
    if (combined.length) {
      add('consent_combined', combined.map((f) => `Форма ${formLabel(f, home.url)}: одна галочка и принимает оферту, и даёт согласие на обработку данных.`), { fields: combined[0].fields.join(', ') });
    }
    if (!consentDocOk) {
      const sameAsPolicy = cands.consent.some((c) => policyKeys.has(c.key));
      add('no_consent_doc', [sameAsPolicy
        ? 'Ссылка «согласие» ведёт на ту же страницу, что и политика, отдельного документа нет.'
        : 'Ссылок на отдельный документ «Согласие на обработку персональных данных» не нашли.']);
    }

    // Лишние данные
    const SEVERE = ['паспортные данные', 'СНИЛС'];
    const SOFT = ['дата рождения', 'адрес'];
    const severe = pdForms.filter((f) => f.fields.some((k) => SEVERE.includes(k)));
    const soft = pdForms.filter((f) => !severe.includes(f) && f.fieldCount <= 5 && f.fields.some((k) => SOFT.includes(k)));
    const excess = severe.length ? severe : soft;
    if (excess.length) {
      const what = uniq(excess.flatMap((f) => f.fields.filter((k) => (severe.length ? SEVERE : SOFT).includes(k)))).join(', ');
      add('excess_data', excess.map((f) => `Форма ${formLabel(f, home.url)}.`), { fields: excess[0].fields.join(', '), what }, severe.length ? 'medium' : 'low');
      state.excess = severe.length ? 'fail' : 'warn';
    } else state.excess = 'ok';

    // Дети
    if (children) {
      const hint = ageMatch ? ageMatch[0] : childStrong ? childStrong[0] : childWords.slice(0, 2).join(', ');
      const inForms = pdForms.some((f) => PARENT_RE.test(f.text));
      if (inForms || says(['consent', 'policy'], 'parent')) state.children = 'ok';
      else if (knownAbsent(['consent', 'policy'], 'parent')) {
        state.children = 'fail';
        add('children_consent', [`На сайте есть «${hint}», а в формах и документах нет слов «родитель» или «законный представитель».`], { hint });
      } else state.children = 'manual';
    }
  }

  if (foreignForms.length) {
    add('foreign_forms', foreignForms.map((s) => `Нашли сервис: ${s.name}.`), { services: foreignForms.map((s) => s.name).join(', ') });
  }

  if (foreign.length) {
    const names = foreign.map((s) => s.name).join(', ');
    const onlyLight = foreign.every((s) => LIGHT_KINDS.has(s.kind));
    const meta = foreign.some((s) => s.meta) ? EXTRA_NOTES.meta : '';
    const details = foreign.map((s) => `Нашли сервис: ${s.name}.`);
    const described = says(['policy'], 'crossBorder');
    if (described) details.push(EXTRA_NOTES.crossBorderDescribed);
    add('foreign_services', details, { services: names, meta }, onlyLight || described ? 'low' : 'medium');
  }

  if (thirdCount >= 10) {
    add('third_party_many', [`Всего сторонних сервисов: ${thirdCount}. Полный список - в конце отчёта.`], { count: thirdCount });
  }

  if (webvisor && !says(['policy'], 'analytics') && !says(['policy'], 'cookie')) {
    if (silent(['policy'], 'analytics')) {
      add('webvisor', ['В коде счётчика Яндекс Метрики включён Вебвизор, а в политике нет ни слова о Метрике, аналитике или cookie.']);
    } else if (policyOk) {
      add('webvisor', ['В коде счётчика Яндекс Метрики включён Вебвизор. Текст политики автоматически прочитать не удалось, проверьте, что Метрика в ней описана.'], {}, 'low');
    } else {
      add('webvisor', ['В коде счётчика Яндекс Метрики включён Вебвизор.']);
    }
  }

  // Cookie
  if (analyticsCookies.length) {
    if (cands.cookie.some(docOk) || says(['policy', 'consent'], 'cookie')) state.cookiePolicy = 'ok';
    else if (knownAbsent(['policy'], 'cookie')) {
      state.cookiePolicy = 'fail';
      add('no_cookie_policy', ['Нет ни отдельной политики cookie, ни упоминания cookie в политике.']);
    } else state.cookiePolicy = 'manual';
    if (!cookieBanner) {
      const noInfo = state.cookiePolicy === 'fail';
      add('cookies_no_notice', [`Cookie, которые появились без согласия посетителя: ${analyticsCookies.join(', ')}.`],
        { cookies: analyticsCookies.join(', ') }, noInfo ? 'medium' : 'low');
    }
  }

  // Продажи и реклама
  if (commerce) {
    // Оферта может быть не на самих страницах, а в разделе с документами: там мы видим только ссылку на неё.
    const offerInHub = says(['policy'], 'offerLink');
    const offerOk = cands.offer.some(docOk) || offerInHub;
    state.offer = offerOk ? 'ok' : 'fail';
    if (!offerOk) add('no_offer', ['На сайте есть цены и оплата, а ссылки на оферту или договор не нашли.']);
    const refundOk = cands.refund.some(docOk) || REFUND_TEXT_RE.test(allText) || says(['offer'], 'refund') || says(['policy'], 'refundLink');
    if (refundOk) state.refund = 'ok';
    else if (offerInHub && !cands.offer.some(docOk)) state.refund = 'manual'; // оферту не читали, утверждать нечего
    else if (knownAbsent(['offer'], 'refund')) {
      state.refund = 'fail';
      add('no_refund', ['Ни на сайте, ни в оферте нет правил возврата денег.']);
    } else state.refund = 'manual';
    if (trial) {
      if (AUTORENEW_RE.test(allText) || says(['offer'], 'autorenew')) state.autorenew = 'ok';
      else if (knownAbsent(['offer'], 'autorenew')) {
        state.autorenew = 'fail';
        add('autorenew_unclear', [`Нашли на сайте: ${quote(trial)}.`], { offer: trial });
      } else state.autorenew = 'manual';
    }
  }

  if (paidLabels.size) {
    const labels = [...paidLabels].slice(0, 3);
    add('hidden_paid_option', labels.map((l) => `Отмеченная галочка: ${quote(l)}.`), { labels: labels.map(quote).join(', ') });
  }

  const t = scan.timer;
  if (t && t.evergreen) {
    add('dark_timer', [`Первый заход: ${quote(t.first)}. Повторный заход через ${t.delta} с: ${quote(t.second)}.`]);
  }
  const shameButtons = uniq(okPages.flatMap((p) => p.data.buttons || [])).filter((b) => SHAME_RE.test(b));
  const pressure = [...snippets(SCARCITY_RE, allText, 3, 25), ...shameButtons].slice(0, 4);
  if (pressure.length) {
    add('dark_patterns', pressure.map((s) => `Фраза на сайте: ${quote(s)}.`), { examples: pressure.map(quote).join(', '), first: quote(pressure[0]) });
  }

  const promises = snippets(PROMISE_RE, allText, 4, 30);
  if (promises.length) {
    add('empty_promises', promises.map((s) => `Фраза на сайте: ${quote(s)}.`), { examples: promises.map(quote).join(', '), first: quote(promises[0]) });
  }

  if (dupReviews) add('reviews_duplicates', [`Отзывов, которые повторяются слово в слово: ${dupReviews}.`]);

  const adPre = pdForms.filter((f) => f.adPre);
  if (adPre.length) {
    add('ad_prechecked', adPre.map((f) => `Форма ${formLabel(f, home.url)}: ` + (f.dupMixed
      ? 'галочка «согласен получать рекламу» повторяется, и одна из копий уже отмечена.'
      : 'галочка «согласен получать рекламу» стоит заранее.')), { fields: adPre[0].fields.join(', ') });
  }

  if (subscription) {
    if (UNSUB_RE.test(allText) || pdForms.some((f) => UNSUB_RE.test(f.text)) || says(['policy', 'consent', 'offer'], 'unsubscribe')) state.unsubscribe = 'ok';
    else if (knownAbsent(['policy', 'consent'], 'unsubscribe')) {
      state.unsubscribe = 'fail';
      add('no_unsubscribe', ['Рядом с подпиской и в документах нет слов о том, как отписаться.']);
    } else state.unsubscribe = 'manual';
  }

  if ((pdForms.length || commerce) && !result.requisites.inn.length && !result.requisites.ogrn.length) {
    add('no_requisites', ['ИНН и ОГРН не нашлись ни на страницах сайта, ни в документах.']);
  }

  // Удобство для всех
  const im = home.data.images || { total: 0, noAlt: 0, emptyAlt: 0, examples: [] };
  const withoutAlt = im.noAlt + im.emptyAlt;
  // В примеры берём только осмысленные имена файлов, а не наборы цифр и букв.
  const imgExamples = im.examples.filter((n) => /[a-zа-я]{3}/i.test(n) && !/^[0-9a-f_-]{10,}\./i.test(n)).slice(0, 4);
  if (im.noAlt >= 3 || (im.total >= 5 && withoutAlt / im.total >= 0.8)) {
    add('img_no_alt', [`Картинок на главной: ${im.total}, без описания: ${withoutAlt}.`].concat(imgExamples.length ? [`Например: ${imgExamples.join(', ')}.`] : []),
      { count: withoutAlt, total: im.total });
  }

  const fails = new Map();
  for (const p of okPages) for (const x of ((p.data.contrast && p.data.contrast.failing) || [])) if (!fails.has(x.text)) fails.set(x.text, x);
  const contrastFails = [...fails.values()];
  if (contrastFails.length >= 3) {
    const ex = contrastFails[0];
    add('low_contrast', contrastFails.slice(0, 3).map((x) => `${quote(x.text)}: цвет ${x.fg} на фоне ${x.bg}, контраст ${ratioText(x.ratio)}:1.`),
      { count: contrastFails.length, example: ex.text, ratio: ratioText(ex.ratio) });
  }

  const kb = scan.keyboard;
  const clickables = uniq(okPages.flatMap((p) => (p.data.keyboard && p.data.keyboard.examples) || []));
  const clickCount = okPages.reduce((s, p) => s + ((p.data.keyboard && p.data.keyboard.clickableNoFocus) || 0), 0);
  const kbReasons = [];
  // Если фокус ушёл во встроенное окно, о перемещении по странице судить нельзя.
  if (kb && kb.distinct < 3 && !kb.enteredFrame && home.data.links.length >= 5) kbReasons.push('Мы нажимали Tab, и фокус почти не перемещался по ссылкам и кнопкам.');
  if (kb && kb.visibleFocused >= 5 && kb.noOutline / kb.visibleFocused >= 0.8) kbReasons.push('Похоже, при переходе клавишей Tab не видно, где сейчас фокус: стандартная рамка выделения отключена.');
  if (clickCount >= 3) {
    kbReasons.push(clickables.length
      ? `Некоторые кнопки (${clickables.slice(0, 3).map(quote).join(', ')}) сделаны так, что до них нельзя дойти клавишей Tab.`
      : 'Некоторые кнопки сделаны так, что до них нельзя дойти клавишей Tab.');
  }
  if (kbReasons.length) add('keyboard_nav', kbReasons);

  // Лицензии
  const stockHosts = uniq(resUrls.filter((u) => STOCK_HOST_RE.test(stripWww(u.hostname))).map((u) => stripWww(u.hostname)));
  const stockFiles = uniq(allUrls.filter((u) => /\.(jpe?g|png|webp|gif|avif)$/i.test(u.pathname))
    .map((u) => decodeSafe(u.pathname.split('/').pop())).filter((n) => STOCK_FILE_RE.test(n))).slice(0, 5);
  if (stockHosts.length) add('stock_hotlink', stockHosts.map((x) => `Картинки грузятся с ${x}.`), { hosts: stockHosts.join(', ') });
  else if (stockFiles.length) add('stock_names', stockFiles.map((x) => `Файл: ${x}.`), { files: stockFiles.map(quote).join(', ') });

  const webFonts = uniq(okPages.flatMap((p) => p.data.webFonts || []));
  const paidFonts = PAID_FONTS.filter(([, re]) => webFonts.some((f) => re.test(f))).map(([name]) => name);
  if (paidFonts.length) {
    const typekit = resUrls.some((u) => /(^|\.)typekit\.(net|com)$/.test(u.hostname));
    const note = isTilda ? EXTRA_NOTES.fontsTilda : typekit ? EXTRA_NOTES.fontsAdobe : '';
    add('paid_fonts', paidFonts.map((x) => `Шрифт: ${x}.`), { fonts: paidFonts.join(', '), note });
  }

  // --- Итог ---
  findings.sort((a, b) => (WEIGHT[b.severity] - WEIGHT[a.severity]) || (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]));
  result.findings = findings;
  for (const f of findings) result.counts[f.severity]++;
  result.score = findings.reduce((s, f) => s + WEIGHT[f.severity], 0);
  const has = (id) => findings.some((f) => f.id === id);
  const sev = (id) => (findings.find((f) => f.id === id) || {}).severity;

  if (!pdForms.length) {
    result.info.push('На просмотренных страницах нет форм, которые собирают имя, телефон или e-mail. Если заявки принимаются на других страницах или в мессенджерах, требования закона к ним тоже относятся.');
  }

  // --- Чек-лист ---
  const consentStatus = !pdForms.length ? 'na'
    : pdForms.some((f) => f.consent === 'none') ? 'fail'
      : pdForms.some((f) => f.consent !== 'checkbox') ? 'warn' : 'ok';
  const inn = result.requisites.inn[0];
  const st = (v, fallback) => v || fallback;
  result.checklist = [
    // Персональные данные
    { group: 'pd', item: 'Сайт работает по HTTPS', status: https ? 'ok' : 'fail' },
    { group: 'pd', item: 'Есть политика обработки персональных данных', status: !pdForms.length && !cands.policy.length ? 'na' : policyOk ? (has('policy_not_near_forms') ? 'warn' : 'ok') : has('policy_inside_offer') ? 'warn' : 'fail' },
    { group: 'pd', item: 'В политике написано, как отозвать согласие и удалить данные', status: pdForms.length ? st(state.deletion, 'na') : 'na' },
    { group: 'pd', item: 'В формах есть галочка согласия', status: consentStatus },
    { group: 'pd', item: 'Есть отдельный текст согласия', status: !pdForms.length ? 'na' : consentDocOk ? 'ok' : 'fail' },
    { group: 'pd', item: 'Согласие не склеено с офертой', status: has('consent_combined') ? 'warn' : pdForms.length ? 'ok' : 'na' },
    { group: 'pd', item: 'Формы не просят лишних данных', status: pdForms.length ? st(state.excess, 'ok') : 'na' },
    { group: 'pd', item: 'Для данных детей есть согласие родителей', status: children && pdForms.length ? st(state.children, 'manual') : 'na' },
    { group: 'pd', item: 'Заявки не уходят в зарубежные сервисы', status: foreignForms.length ? 'fail' : 'ok' },
    { group: 'pd', item: 'Нет зарубежной аналитики и рекламы', status: !foreign.length ? 'ok' : sev('foreign_services') === 'low' ? 'warn' : 'fail' },
    { group: 'pd', item: 'Сторонних сервисов немного', status: thirdCount >= 10 ? 'warn' : 'ok', note: thirdCount ? `Нашли: ${thirdCount}.` : '' },
    {
      group: 'pd',
      item: 'Подано уведомление в Роскомнадзор',
      status: 'manual',
      note: (inn ? `Проверьте ИНН ${inn}` : 'Проверьте по ИНН компании') + RKN_NOTE,
    },
    // Cookie
    { group: 'cookie', item: 'Есть баннер о cookie', status: cookieBanner ? 'ok' : analyticsCookies.length ? (sev('cookies_no_notice') === 'medium' ? 'fail' : 'warn') : 'na' },
    { group: 'cookie', item: 'Объяснено, какие cookie использует сайт', status: analyticsCookies.length ? st(state.cookiePolicy, 'manual') : 'na' },
    // Продажи и реклама
    { group: 'commerce', item: 'Есть оферта', status: commerce ? st(state.offer, 'fail') : 'na' },
    { group: 'commerce', item: 'Описано, как вернуть деньги', status: commerce ? st(state.refund, 'manual') : 'na' },
    { group: 'commerce', item: 'Нет платных опций, включённых заранее', status: paidLabels.size ? 'fail' : 'ok' },
    { group: 'commerce', item: 'Понятны условия автопродления', status: commerce && trial ? st(state.autorenew, 'manual') : 'na' },
    { group: 'commerce', item: 'Нет фальшивых таймеров и давления', status: has('dark_timer') ? 'fail' : has('dark_patterns') ? 'warn' : 'ok' },
    { group: 'commerce', item: 'Нет громких обещаний без подтверждения', status: has('empty_promises') ? 'warn' : 'ok' },
    {
      group: 'commerce',
      item: 'Отзывы настоящие',
      status: dupReviews ? 'warn' : hasReviews ? 'manual' : 'na',
      note: hasReviews && !dupReviews ? EXTRA_NOTES.reviewsManual : '',
    },
    { group: 'commerce', item: 'Галочка согласия на рекламу не стоит заранее', status: adPre.length ? 'fail' : 'ok' },
    { group: 'commerce', item: 'Понятно, как отписаться от рассылки', status: subscription ? st(state.unsubscribe, 'manual') : 'na' },
    { group: 'commerce', item: 'Указаны реквизиты компании', status: result.requisites.inn.length || result.requisites.ogrn.length ? 'ok' : 'warn' },
    // Удобство для всех
    { group: 'a11y', item: 'У картинок есть описания (alt)', status: has('img_no_alt') ? 'warn' : im.total ? 'ok' : 'na' },
    { group: 'a11y', item: 'Текст хорошо читается (контраст)', status: has('low_contrast') ? 'warn' : 'ok' },
    { group: 'a11y', item: 'Сайтом можно пользоваться с клавиатуры', status: has('keyboard_nav') ? 'warn' : 'ok' },
    // Лицензии
    { group: 'license', item: 'Нет признаков фото со стоков без лицензии', status: has('stock_hotlink') ? 'fail' : has('stock_names') ? 'warn' : 'ok' },
    { group: 'license', item: 'Нет платных шрифтов без проверки лицензии', status: has('paid_fonts') ? 'warn' : 'ok' },
  ];

  return result;
}

module.exports = {
  analyze, docCandidates, linkKind, consentType, hostOf, stripWww, safeUrl, siteLabel, baseDomain,
  RULES, GROUPS, RKN_NOTE, EXTRA_NOTES, POLICY_RE, CONSENT_DOC_RE, DOC_KINDS,
};
