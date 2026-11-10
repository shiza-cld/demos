'use strict';

const { extractRequisites } = require('./inn');

// ---------- Справочники ----------

const POLICY_RE = /(политик|конфиденциальн|privacy|policy|personal[-_ ]?data|персональн|politika)/i;
const CONSENT_DOC_RE = /(согласи[еяю]|consent|soglasi)/i;
const PD_WORDS_RE = /(персональн|обработк|конфиденц|политик|152)/i;
const AD_WORDS_RE = /(реклам|рассылк|новост|предложени|акци|звонк|маркетинг|информационн)/i;
// Ссылки на «хаб» юридических документов («Правовая информация», /legal) — засчитываем как путь к политике.
const HUB_RE = /(правов\S*\s+информац|юридическ\S*\s+информац|правовые\s+документ|^документы$|\/legal\b|\/docs?\b|\/documents\b)/i;
// Поля, по которым форму точно можно считать сбором персональных данных.
const STRONG_KINDS = new Set(['телефон', 'e-mail', 'имя', 'мессенджер', 'паспортные данные', 'дата рождения']);
// Доменные зоны второго уровня, где «сайт» — это третий уровень.
const MULTI_SUFFIX = new Set(['tilda.ws', 'github.io', 'com.ru', 'net.ru', 'org.ru', 'msk.ru', 'spb.ru', 'pp.ru', 'co.uk', 'com.ua', 'org.ua', 'com.kz', 'gitlab.io', 'netlify.app', 'vercel.app', 'taplink.cc', 'nethouse.ru', 'wixsite.com', 'tb.ru', 'ucoz.ru', 'narod.ru']);
const PASSIVE_RE = /(нажимая|нажав|отправляя|отправив|оставляя|оставив|заполняя|заполнив|регистрируясь|продолжая)[^.!?]{0,160}(соглаша|соглас|принима|даю|подтвержда|ознакомл)/i;
const ANALYTICS_COOKIE_RE = /^(_ga|_gid|_gat|_gcl|_ym|_fbp|_fbc|tmr_|_hj|_clck|_clsk|_ttp)/;

const FOREIGN_SERVICES = [
  { id: 'ga', name: 'Google Analytics', kind: 'analytics', test: (u) => /(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(u.hostname) },
  { id: 'gtm', name: 'Google Tag Manager', kind: 'analytics', test: (u) => /(^|\.)googletagmanager\.com$/.test(u.hostname) },
  { id: 'gads', name: 'Google Ads', kind: 'ads', test: (u) => /(^|\.)(doubleclick\.net|googleadservices\.com|googlesyndication\.com)$/.test(u.hostname) },
  { id: 'recaptcha', name: 'Google reCAPTCHA', kind: 'captcha', test: (u) => /(^|\.)(google\.com|gstatic\.com|recaptcha\.net)$/.test(u.hostname) && /\/recaptcha/.test(u.pathname) },
  { id: 'gfonts', name: 'Google Fonts', kind: 'fonts', test: (u) => /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname) },
  { id: 'meta', name: 'Meta Pixel (Facebook)', kind: 'ads', test: (u) => /(^|\.)connect\.facebook\.net$/.test(u.hostname) || (/(^|\.)facebook\.com$/.test(u.hostname) && /^\/tr/.test(u.pathname)) },
  { id: 'tiktok', name: 'TikTok Pixel', kind: 'ads', test: (u) => /(^|\.)analytics\.tiktok\.com$/.test(u.hostname) },
  { id: 'hotjar', name: 'Hotjar', kind: 'analytics', test: (u) => /(^|\.)hotjar\.(com|io)$/.test(u.hostname) },
  { id: 'clarity', name: 'Microsoft Clarity', kind: 'analytics', test: (u) => /(^|\.)clarity\.ms$/.test(u.hostname) },
  { id: 'tawk', name: 'Tawk.to (чат)', kind: 'chat', test: (u) => /(^|\.)tawk\.to$/.test(u.hostname) },
  { id: 'intercom', name: 'Intercom (чат)', kind: 'chat', test: (u) => /(^|\.)(intercom\.io|intercomcdn\.com)$/.test(u.hostname) },
  { id: 'livechat', name: 'LiveChat (чат)', kind: 'chat', test: (u) => /(^|\.)livechatinc\.com$/.test(u.hostname) },
  { id: 'crisp', name: 'Crisp (чат)', kind: 'chat', test: (u) => /(^|\.)crisp\.chat$/.test(u.hostname) },
  { id: 'youtube', name: 'YouTube (видео)', kind: 'video', test: (u) => /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com)$/.test(u.hostname) },
  { id: 'vimeo', name: 'Vimeo (видео)', kind: 'video', test: (u) => /(^|\.)(vimeo\.com|vimeocdn\.com)$/.test(u.hostname) },
];

const FOREIGN_FORMS = [
  { name: 'Google Forms', test: (u) => (/(^|\.)docs\.google\.com$/.test(u.hostname) && /^\/forms/.test(u.pathname)) || /(^|\.)forms\.gle$/.test(u.hostname) },
  { name: 'Typeform', test: (u) => /(^|\.)typeform\.com$/.test(u.hostname) && u.pathname.length > 1 },
  { name: 'JotForm', test: (u) => /(^|\.)jotform\.(com|eu|me)$/.test(u.hostname) },
  { name: 'Tally', test: (u) => /(^|\.)tally\.so$/.test(u.hostname) },
  { name: 'Calendly', test: (u) => /(^|\.)calendly\.com$/.test(u.hostname) && u.pathname.length > 1 },
  { name: 'HubSpot Forms', test: (u) => /(^|\.)(hsforms\.net|hsforms\.com)$/.test(u.hostname) },
  { name: 'Microsoft Forms', test: (u) => /(^|\.)forms\.(office|microsoft)\.com$/.test(u.hostname) },
];

const RU_TRACKERS = [
  { name: 'Яндекс Метрика', test: (u) => /(^|\.)mc\.yandex\.(ru|com)$/.test(u.hostname) },
  { name: 'пиксель VK / Top@Mail.ru', test: (u) => /(^|\.)top-fwz1\.mail\.ru$/.test(u.hostname) || (/(^|\.)vk\.com$/.test(u.hostname) && /^\/rtrg/.test(u.pathname)) },
  { name: 'коллтрекинг (Calltouch / CoMagic / Roistat)', test: (u) => /(^|\.)(calltouch\.ru|comagic\.ru|uiscom\.ru|roistat\.com)$/.test(u.hostname) },
  { name: 'онлайн-чат или виджет обратного звонка', test: (u) => /(^|\.)(jivosite\.com|jivo\.ru|bitrix24\.ru|envybox\.io|callbackkiller\.ru)$/.test(u.hostname) },
];

const GENERIC_LOCAL_RE = /^(info|hello|hi|mail|office|support|help|sales|admin|contact|contacts|zakaz|order|orders|school|team|manager|pr|marketing|partner|partners|reception|client|clients|feedback|welcome|edu|study|kurs|kursy|courses|academy|director|buh|hr|job|jobs|press|media|service|shop|store|booking|zapis|priem|post|general|company|studio|ask|question|questions|care|customer|otdel|sale|corp)([._-]|\d|$)/i;
const BAD_EMAIL_RE = /(\.(png|jpe?g|gif|webp|svg|js|css|ico)$)|(@(example|domain|yourdomain|site|mysite)\.)|(^(name|your|email|example|test|user|username|ivanov|login)@)|sentry|wixpress/i;

// Вес замечаний для сортировки «горячих» сайтов.
const WEIGHT = { high: 3, medium: 2, low: 1 };

// ---------- Тексты замечаний ----------
// {fields}, {services} и т.п. подставляются при формировании отчёта.

const RULES = {
  no_https: {
    severity: 'high',
    title: 'Сайт открывается без HTTPS',
    why: 'Имя и телефон из форм передаются в открытом виде. Оператор обязан принимать меры для защиты персональных данных (ст. 19 152-ФЗ), а браузеры помечают такие сайты как «Не защищено» — это отпугивает посетителей.',
    fix: 'Подключить SSL-сертификат (у большинства хостингов и конструкторов это бесплатно) и включить автоматическое перенаправление с http:// на https://.',
    tilda: 'В Tilda: в настройках сайта, в разделе домена, включите HTTPS и перенаправление на него.',
    short: 'сайт открывается без HTTPS — данные из форм передаются незащищёнными',
  },
  no_policy: {
    severity: 'high',
    title: 'Не найдена политика обработки персональных данных',
    why: 'Если сайт собирает данные через формы, политику нужно опубликовать на страницах, где идёт сбор (ч. 2 ст. 18.1 152-ФЗ). За её отсутствие предусмотрен штраф по ч. 3 ст. 13.11 КоАП — это одно из самых частых нарушений.',
    fix: 'Опубликовать политику отдельной страницей и поставить на неё ссылку в подвале сайта и рядом с каждой формой. Политика должна описывать именно ваш сайт: какие данные собираются, зачем, какие сервисы подключены (Метрика, CRM, рассылки), сколько данные хранятся.',
    tilda: 'В Tilda: создайте отдельную страницу «Политика обработки персональных данных» и добавьте ссылку на неё в подвал и в текст под кнопкой каждой формы.',
    short: 'на сайте нет политики обработки персональных данных, хотя формы собирают {fields}',
  },
  policy_broken: {
    severity: 'high',
    title: 'Ссылка на политику не работает',
    why: 'Ссылка ведёт на ошибку или на страницу без текста о персональных данных. Для проверяющего это равносильно отсутствию политики (ч. 2 ст. 18.1 152-ФЗ).',
    fix: 'Исправить ссылку и опубликовать актуальный текст политики.',
    tilda: null,
    short: 'ссылка на политику обработки данных ведёт на ошибку',
  },
  policy_not_near_forms: {
    severity: 'medium',
    title: 'На страницах с формами нет ссылки на политику',
    why: 'Политика есть, но на некоторых страницах, где собираются данные, ссылки на неё нет. Закон требует обеспечить доступ к политике именно на страницах сбора данных (ч. 2 ст. 18.1 152-ФЗ).',
    fix: 'Добавить ссылку на политику в подвал этих страниц и рядом с формой.',
    tilda: null,
    short: 'на страницах с формами нет ссылки на политику',
  },
  no_consent: {
    severity: 'high',
    title: 'Формы собирают данные без согласия на обработку',
    why: 'Для обработки данных из заявок, как правило, нужно согласие посетителя (ст. 9 152-ФЗ). С 1 сентября 2025 года согласие должно быть конкретным, информированным и оформленным отдельно от других документов.',
    fix: 'Добавить в каждую форму обязательную галочку, по умолчанию не отмеченную, с текстом «Я даю согласие на обработку персональных данных» и ссылкой на отдельный документ согласия.',
    tilda: 'В Tilda: добавьте в форму поле типа «Чекбокс», сделайте его обязательным, не ставьте галочку по умолчанию и добавьте в подпись ссылку на документ согласия.',
    short: 'форма «{fields}» {where} собирает данные без согласия на обработку',
  },
  consent_passive: {
    severity: 'medium',
    title: 'Согласие оформлено пассивной фразой',
    why: 'Фраза вида «Нажимая кнопку, вы соглашаетесь…» — слабая форма согласия. С 1 сентября 2025 года согласие оформляется отдельно от других документов и должно быть однозначным. Надёжнее — активная галочка и отдельный документ.',
    fix: 'Заменить фразу на обязательную, не отмеченную заранее галочку со ссылкой на документ согласия.',
    tilda: 'В Tilda: добавьте в форму обязательное поле «Чекбокс» без галочки по умолчанию и уберите фразу «Нажимая на кнопку…» из текста под кнопкой.',
    short: 'в форме «{fields}» согласие оформлено фразой «нажимая кнопку…», без галочки',
  },
  consent_prechecked: {
    severity: 'medium',
    title: 'Галочка согласия стоит заранее',
    why: 'Согласие должно быть сознательным и однозначным (ст. 9 152-ФЗ). Заранее проставленная галочка не подтверждает, что человек действительно согласился.',
    fix: 'Убрать галочку по умолчанию и сделать поле обязательным для отправки формы.',
    tilda: 'В Tilda: в настройках поля «Чекбокс» отключите отметку по умолчанию и сделайте поле обязательным.',
    getcourse: 'В GetCourse отметка по умолчанию может быть включена и в настройках формы, и в общих настройках аккаунта для галочек согласия — проверьте оба места и уберите дублирующие галочки.',
    short: 'в форме «{fields}» галочка согласия проставлена заранее',
  },
  no_consent_doc: {
    severity: 'medium',
    title: 'Нет отдельного документа согласия',
    why: 'С 1 сентября 2025 года согласие на обработку персональных данных оформляется отдельно от иных документов — политики, оферты, пользовательского соглашения. Ссылки в форме только на политику уже недостаточно.',
    fix: 'Подготовить отдельный документ «Согласие на обработку персональных данных» (кто оператор, какие данные, цели, действия с ними, срок, как отозвать согласие) и поставить ссылку на него у каждой формы.',
    tilda: null,
    short: 'нет отдельного документа согласия — с 1 сентября 2025 года он обязателен',
  },
  foreign_forms: {
    severity: 'high',
    title: 'Заявки собираются через иностранный сервис',
    why: 'Данные граждан России при сборе нужно записывать в базы данных на территории России (ч. 5 ст. 18 152-ФЗ). Сервисы {services} хранят ответы на зарубежных серверах.',
    fix: 'Перенести сбор заявок во встроенные формы сайта или в российский сервис.',
    tilda: 'В Tilda: замените ссылку на внешнюю форму встроенным блоком формы Tilda.',
    short: 'заявки собираются через {services} — данные хранятся за рубежом',
  },
  foreign_services: {
    severity: 'medium',
    title: 'Подключены иностранные сервисы',
    why: 'Сервисы {services} получают данные посетителей (IP-адрес, cookie, действия на сайте) на зарубежных серверах. Это может считаться трансграничной передачей персональных данных: о ней нужно заранее уведомить Роскомнадзор (ст. 12 152-ФЗ) и указать её в политике.{meta}',
    fix: 'Убрать сервисы или заменить российскими аналогами: Google Analytics — Яндекс Метрикой, reCAPTCHA — Yandex SmartCaptcha, Google Fonts — шрифтами, загруженными на сам сайт, YouTube — VK Видео или Rutube. Если сервис нужен, подать уведомление о трансграничной передаче и отразить её в политике.',
    tilda: null,
    short: 'подключены {services} — это трансграничная передача данных, о ней нужно уведомлять Роскомнадзор',
  },
  webvisor: {
    severity: 'medium',
    title: 'Вебвизор записывает действия посетителей',
    why: 'Вебвизор Яндекс Метрики записывает действия посетителей, включая ввод в поля форм. Это обработка персональных данных, её нужно отразить в политике и согласии.',
    fix: 'Указать Метрику и Вебвизор в политике и согласии или отключить запись содержимого полей в настройках счётчика.',
    tilda: null,
    short: 'включён Вебвизор — он записывает ввод в формы',
  },
  cookies_no_notice: {
    severity: 'low',
    title: 'Cookie ставятся без уведомления',
    why: 'Сервисы аналитики ставят cookie ({cookies}) сразу при входе, а предупреждения об этом на странице не видно. Cookie вместе с IP-адресом могут считаться персональными данными, поэтому посетителя стоит уведомить и дать ссылку на политику.',
    fix: 'Добавить плашку об использовании cookie со ссылкой на политику и описать cookie в самой политике.',
    tilda: 'В Tilda: добавьте блок с уведомлением о cookie (поиск по библиотеке блоков — «cookie») со ссылкой на политику.',
    short: 'сайт ставит cookie аналитики без уведомления посетителя',
  },
  no_requisites: {
    severity: 'low',
    title: 'Не найдены реквизиты владельца сайта',
    why: 'Посетитель должен понимать, кто обрабатывает его данные: оператор указывается в политике и согласии. Без ИНН и ОГРН на сайте это неочевидно.',
    fix: 'Указать наименование, ИНН и ОГРН (ОГРНИП) в подвале сайта и в политике.',
    tilda: null,
    short: 'на сайте не указаны реквизиты владельца (ИНН, ОГРН)',
  },
  consent_combined: {
    severity: 'medium',
    title: 'Согласие на обработку объединено с офертой',
    why: 'Одна галочка одновременно принимает оферту (пользовательское соглашение) и даёт согласие на обработку персональных данных. С 1 сентября 2025 года согласие оформляется отдельно от иных документов, которые подтверждает человек (ст. 9 152-ФЗ).',
    fix: 'Разделить на две галочки: «принимаю условия оферты» и отдельно «даю согласие на обработку персональных данных» со ссылкой на документ согласия.',
    tilda: null,
    getcourse: 'В GetCourse такая формулировка часто стоит в общей галочке платформы — замените её на два отдельных пункта.',
    short: 'в форме «{fields}» согласие на обработку объединено с принятием оферты в одной галочке',
  },
  ad_prechecked: {
    severity: 'medium',
    title: 'Галочка согласия на рекламу стоит заранее',
    why: 'Рекламные звонки, сообщения и письма можно отправлять только с предварительного согласия человека (ч. 1 ст. 18 закона «О рекламе»). Заранее проставленная галочка — спорное подтверждение такого согласия: по жалобе получателя ФАС может признать рассылку незаконной и оштрафовать компанию.',
    fix: 'Убрать галочку по умолчанию: человек должен поставить её сам. Согласие на рекламу должно оставаться отдельным от согласия на обработку персональных данных.',
    tilda: 'В Tilda: в настройках поля «Чекбокс» отключите отметку по умолчанию.',
    getcourse: 'В GetCourse отметка по умолчанию может быть включена и в настройках формы, и в общих настройках аккаунта для галочек согласия — проверьте оба места и уберите дублирующие галочки.',
    short: 'в форме «{fields}» галочка согласия на рекламную рассылку проставлена заранее',
  },
};

// ---------- Вспомогательные функции ----------

const safeUrl = (s) => { try { return new URL(s); } catch (e) { return null; } };
const stripWww = (h) => String(h || '').replace(/^www\./i, '').toLowerCase();
const hostOf = (s) => { const u = safeUrl(s); return u ? stripWww(u.hostname) : String(s || ''); };
const withoutHash = (s) => { const u = safeUrl(s); if (!u) return s; u.hash = ''; return u.href; };
const uniq = (arr) => [...new Set(arr)];
const fill = (tpl, vars) => (tpl == null ? null : String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : '')));

function baseDomain(h) {
  const parts = stripWww(h).split('.');
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return MULTI_SUFFIX.has(last2) ? parts.slice(-3).join('.') : last2;
}
const sameSite = (h1, h2) => baseDomain(h1) === baseDomain(h2);

// «Сайт» для отчётов: хост + путь (чтобы различать, например, несколько проектов на github.io).
function siteLabel(url) {
  const u = safeUrl(url);
  if (!u) return String(url || '');
  const path = u.pathname.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
  return stripWww(u.hostname) + path;
}

// homeUrl — адрес, с которого начали проверку: он считается «главной страницей».
function pageLabel(url, homeUrl) {
  const u = safeUrl(url);
  if (!u) return String(url);
  const h = safeUrl(homeUrl);
  const trim = (x) => x.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '');
  if (u.pathname === '/' || (h && trim(u.pathname) === trim(h.pathname))) return 'главная страница';
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch (e) { /* оставляем как есть */ }
  return p.length > 60 ? p.slice(0, 57) + '…' : p;
}

function wherePage(url, homeUrl) {
  const l = pageLabel(url, homeUrl);
  return l === 'главная страница' ? 'на главной странице' : 'на странице ' + l;
}

// Тип ссылки: 'policy' (политика или раздел с юр. документами), 'consent' (согласие на обработку ПДн) или null.
// Для чужих доменов судим только по тексту ссылки: адрес вроде yandex.ru/legal/... — не политика сайта.
function linkKind(l, siteHost) {
  const u = safeUrl(l.href);
  let path = '';
  if (u) { try { path = decodeURIComponent(u.pathname + u.hash); } catch (e) { path = u.pathname + u.hash; } }
  const text = l.text || '';
  const own = !siteHost || !u || sameSite(u.hostname, siteHost);
  const s = own ? text + ' ' + path : text;
  if (/(реклам|рассылк)/i.test(text)) return null; // согласие на рекламу — не про обработку ПДн
  if (CONSENT_DOC_RE.test(s) && !/cookie|куки/i.test(text)) return 'consent';
  if (POLICY_RE.test(s)) return 'policy';
  if (own && HUB_RE.test(text.trim() + ' ' + path)) return 'policy';
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

// Кандидаты на «политику» и «согласие» — их потом скачиваем и проверяем в scan.js.
function docCandidates(pages) {
  const out = { policy: new Map(), consent: new Map() };
  const first = pages.find((p) => p.data);
  const siteHost = first ? hostOf(first.url) : null;
  for (const p of pages) {
    if (!p.data) continue;
    for (const l of p.data.links) {
      const kind = linkKind(l, siteHost);
      if (!kind) continue;
      if (!/^https?:/i.test(l.href)) continue;
      const key = docKey(l, p.url);
      const score = /(персональн|конфиденц|privacy|personal|согласи)/i.test(l.text + ' ' + l.href) ? 2
        : POLICY_RE.test(l.text) ? 1 : 0;
      const prev = out[kind].get(key);
      if (!prev || prev.score < score) out[kind].set(key, { href: l.href, key, score, popup: isPopupLink(l, p.url) });
    }
  }
  const sorted = (m) => [...m.values()].sort((a, b) => b.score - a.score);
  return { policy: sorted(out.policy), consent: sorted(out.consent) };
}

// Галочка про обработку ПДн (в т.ч. «Я согласен» без уточнений) или про рекламу/рассылку.
const isPdBox = (c) => PD_WORDS_RE.test(c.label) || (/соглас/i.test(c.label) && !AD_WORDS_RE.test(c.label));
const isAdBox = (c) => !isPdBox(c) && AD_WORDS_RE.test(c.label);
// Если в форме есть видимые галочки — оцениваем только их (скрытые бывают служебными копиями).
// Если видимых нет (форма в закрытом попапе), а одна подпись повторяется с разным состоянием —
// не знаем, какую копию увидит человек, и считаем галочку неотмеченной: лучше пропустить, чем обвинить зря.
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
    // Галочка без подписи (подпись нарисована рядом картинкой/стилями) — смотрим на текст формы.
    const unlabeled = all.filter((c) => !isAdBox(c) && c.label.length < 3);
    if (unlabeled.length === 1 && PD_WORDS_RE.test(f.formText)) boxes = unlabeled;
  }
  if (boxes.length) return boxes.some((c) => c.checked) ? 'prechecked' : 'checkbox';
  const adLabels = all.filter(isAdBox).map((c) => c.label);
  let text = f.formText + ' ' + f.blockText;
  for (const l of adLabels) text = text.split(l).join(' ');
  if (PASSIVE_RE.test(text)) return 'passive';
  if (/(согласи[еяю]\s+на\s+обработку|обработк\S*\s+персональн)/i.test(text)) return 'passive';
  return 'none';
}

const adPrechecked = (f) => shownBoxes(f).some((c) => isAdBox(c) && c.checked);
// В форме несколько одинаковых галочек, и часть из них уже отмечена (типично для GetCourse: свои галочки + общие галочки платформы).
const duplicateMixed = (f) => {
  const m = new Map();
  for (const c of shownBoxes(f)) { const g = m.get(c.label) || []; g.push(c.checked); m.set(c.label, g); }
  return [...m.values()].some((g) => g.length > 1 && g.includes(true) && g.includes(false));
};
// Одна галочка и «принимаю оферту», и «согласен на обработку ПДн».
const consentCombined = (f) => shownBoxes(f).some((c) => PD_WORDS_RE.test(c.label) && COMBINED_RE.test(c.label));

function classifyEmails(emails, siteHost) {
  const clean = uniq(emails.map((e) => e.toLowerCase().trim()))
    .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !BAD_EMAIL_RE.test(e));
  const sameDomainFirst = (a, b) => (hostOf('http://' + b.split('@')[1]).endsWith(siteHost) ? 1 : 0) - (hostOf('http://' + a.split('@')[1]).endsWith(siteHost) ? 1 : 0);
  clean.sort(sameDomainFirst);
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
  return `«${f.fields.join(', ')}» — ${where}${frame}`;
}

// ---------- Главная функция ----------

/**
 * scan = {
 *   input, startUrl, scannedAt,
 *   pages: [{ url, status, data, error }],   // data — результат extractPageData
 *   cookies: [{ name, domain }],
 *   requests: [url, ...],
 *   docs: { [key]: { ok, status, error, reqText } }
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
    requisites: { inn: [], ogrn: [] },
    emails: { generic: [], other: [] },
    foreign: [],
    foreignForms: [],
    ruTrackers: [],
    counts: { high: 0, medium: 0, low: 0 },
    score: 0,
    documents: [],
  };
  if (!home) return result;

  result.platform = detectPlatform(home);
  const isTilda = result.platform === 'Tilda';
  const isGetCourse = result.platform === 'GetCourse';

  // --- Формы с персональными данными (одинаковые формы на разных страницах склеиваем) ---
  const pdForms = [];
  const seen = new Map();
  for (const p of okPages) {
    for (const f of p.data.forms) {
      if (!f.pdCount || !f.fields.some((k) => STRONG_KINDS.has(k))) continue;
      const consent = consentType(f);
      const adPre = adPrechecked(f);
      const combined = consentCombined(f);
      const key = f.fields.join(',') + '|' + consent + '|' + adPre + '|' + combined + '|' + (f.frameUrl ? hostOf(f.frameUrl) : '');
      if (seen.has(key)) { seen.get(key).pages.add(p.url); continue; }
      const entry = { fields: f.fields, consent, adPre, combined, dupMixed: duplicateMixed(f), page: p.url, pages: new Set([p.url]), frameUrl: f.frameUrl || null, visible: f.visible };
      seen.set(key, entry);
      pdForms.push(entry);
    }
  }
  result.forms = pdForms.map((f) => ({ fields: f.fields, consent: f.consent, adPrechecked: f.adPre, page: f.page, pages: [...f.pages], frameUrl: f.frameUrl }));
  const allFields = uniq(pdForms.flatMap((f) => f.fields));
  const fieldsText = allFields.length ? allFields.join(', ') : 'контактные данные';

  // --- Документы: политика и согласие ---
  const cands = docCandidates(okPages);
  const docs = scan.docs || {};
  const docOk = (c) => c.popup || (docs[c.key] && docs[c.key].ok);
  const policyOk = cands.policy.some(docOk);
  const policyKeys = new Set(cands.policy.map((c) => c.key));
  const consentDocOk = cands.consent.some((c) => docOk(c) && !policyKeys.has(c.key));
  // Для прозрачности: какие документы нашли и что про них узнали (попадает в results.json).
  result.documents = [...cands.policy.map((c) => ({ type: 'политика', ...c })), ...cands.consent.map((c) => ({ type: 'согласие', ...c }))]
    .slice(0, 8).map((c) => {
      const d = docs[c.key];
      return { type: c.type, href: c.href, popup: c.popup, checked: !!d, ok: d ? d.ok : null, status: d ? d.status : null, mentions: d ? d.mentions : null };
    });
  const policyDocs = cands.policy.map((c) => docs[c.key]).filter((d) => d && d.ok);
  // true — в документе прямо сказано; false — полноценный текст политики есть, но не сказано; null — не знаем (PDF, попап, SPA).
  const policySays = (k) => policyDocs.some((d) => d.mentions && d.mentions[k] === true);
  const policySilent = (k) => policyDocs.some((d) => d.mentions && d.mentions[k] === false);

  // --- Реквизиты ---
  const reqSources = okPages.flatMap((p) => p.data.reqText);
  for (const d of Object.values(docs)) if (d && d.reqText) reqSources.push(...d.reqText);
  result.requisites = extractRequisites(reqSources);

  // --- Контакты ---
  result.emails = classifyEmails(okPages.flatMap((p) => p.data.emails), result.domain);

  // --- Внешние сервисы ---
  const resUrls = uniq([...(scan.requests || []), ...okPages.flatMap((p) => p.data.resources)]).map(safeUrl).filter(Boolean)
    .filter((u) => !stripWww(u.hostname).endsWith(result.domain));
  const linkUrls = uniq(okPages.flatMap((p) => p.data.links.map((l) => l.href))).map(safeUrl).filter(Boolean);
  const foreign = FOREIGN_SERVICES.filter((s) => resUrls.some((u) => s.test(u)));
  const foreignForms = FOREIGN_FORMS.filter((s) => resUrls.some((u) => s.test(u)) || linkUrls.some((u) => s.test(u)));
  const ruTrackers = RU_TRACKERS.filter((s) => resUrls.some((u) => s.test(u)));
  result.foreign = foreign.map((s) => s.name);
  result.foreignForms = foreignForms.map((s) => s.name);
  result.ruTrackers = ruTrackers.map((s) => s.name);

  const analyticsCookies = uniq((scan.cookies || []).map((c) => c.name).filter((n) => ANALYTICS_COOKIE_RE.test(n)));
  const cookieMention = okPages.some((p) => p.data.cookieMention);
  const webvisor = okPages.some((p) => p.data.webvisor);
  const https = home.data.protocol === 'https:';

  // --- Замечания ---
  const findings = [];
  const add = (id, details, vars = {}, severity) => {
    const r = RULES[id];
    findings.push({
      id,
      severity: severity || r.severity,
      title: r.title,
      details,
      why: fill(r.why, vars),
      fix: fill(r.fix, vars),
      tip: isTilda && r.tilda ? fill(r.tilda, vars) : isGetCourse && r.getcourse ? fill(r.getcourse, vars) : null,
      short: fill(r.short, vars),
    });
  };

  if (!https && pdForms.length) add('no_https', [`Адрес сайта: ${home.url}`]);

  if (pdForms.length) {
    if (!cands.policy.length) {
      add('no_policy', ['Ссылок на политику обработки персональных данных на просмотренных страницах нет.'], { fields: fieldsText });
    } else if (!policyOk) {
      const details = cands.policy.slice(0, 3).map((c) => {
        const d = docs[c.key];
        if (!d) return `${c.href} — не проверялась`;
        if (d.error) return `${c.href} — не открывается (${d.error})`;
        if (d.status >= 400) return `${c.href} — ошибка ${d.status}`;
        return `${c.href} — на странице нет текста о персональных данных`;
      });
      add('policy_broken', details);
    } else {
      const pdPages = uniq(pdForms.flatMap((f) => [...f.pages]));
      const missing = pdPages.filter((u) => {
        const p = okPages.find((x) => x.url === u);
        return p && !p.data.links.some((l) => linkKind(l, result.domain) === 'policy');
      });
      if (missing.length) add('policy_not_near_forms', missing.map((u) => `Нет ссылки ${wherePage(u, home.url)}`));
    }

    const none = pdForms.filter((f) => f.consent === 'none');
    const passive = pdForms.filter((f) => f.consent === 'passive');
    const pre = pdForms.filter((f) => f.consent === 'prechecked');
    if (none.length) {
      add('no_consent', none.map((f) => `Форма ${formLabel(f, home.url)}: ни галочки, ни упоминания согласия на обработку данных.`),
        { fields: none[0].fields.join(', '), where: none[0].pages.size > 1 ? `на ${none[0].pages.size} страницах` : wherePage(none[0].page, home.url) });
    }
    if (passive.length) {
      add('consent_passive', passive.map((f) => `Форма ${formLabel(f, home.url)}: согласие только текстом, без галочки.`), { fields: passive[0].fields.join(', ') });
    }
    if (pre.length) {
      add('consent_prechecked', pre.map((f) => `Форма ${formLabel(f, home.url)}: ` + (f.dupMixed
        ? 'в форме повторяются одинаковые галочки согласия, и одна из копий уже отмечена.'
        : 'галочка согласия отмечена заранее.')), { fields: pre[0].fields.join(', ') });
    }
    const combined = pdForms.filter((f) => f.combined && f.consent !== 'none');
    if (combined.length) {
      add('consent_combined', combined.map((f) => `Форма ${formLabel(f, home.url)}: одна галочка и принимает оферту (соглашение), и даёт согласие на обработку данных.`), { fields: combined[0].fields.join(', ') });
    }
    const adPre = pdForms.filter((f) => f.adPre);
    if (adPre.length) {
      add('ad_prechecked', adPre.map((f) => `Форма ${formLabel(f, home.url)}: ` + (f.dupMixed
        ? 'галочка «согласен получать рекламу/рассылку» повторяется, и одна из копий уже отмечена.'
        : 'галочка «согласен получать рекламу/рассылку» отмечена заранее.')), { fields: adPre[0].fields.join(', ') });
    }
    if (!consentDocOk) {
      const sameAsPolicy = cands.consent.some((c) => policyKeys.has(c.key));
      add('no_consent_doc', [sameAsPolicy
        ? 'Ссылка «согласие» ведёт на ту же страницу, что и политика, — отдельного документа нет.'
        : 'Ссылок на отдельный документ «Согласие на обработку персональных данных» не найдено.']);
    }
  }

  if (foreignForms.length) {
    const names = foreignForms.map((s) => s.name).join(', ');
    add('foreign_forms', foreignForms.map((s) => `Обнаружен сервис: ${s.name}`), { services: names });
  }

  if (foreign.length) {
    const names = foreign.map((s) => s.name).join(', ');
    const onlyLight = foreign.every((s) => s.kind === 'fonts' || s.kind === 'video');
    const meta = foreign.some((s) => s.id === 'meta')
      ? ' Отдельно: компания Meta признана в России экстремистской организацией, поэтому её пиксель на сайте несёт дополнительные риски.'
      : '';
    const details = foreign.map((s) => `Обнаружен сервис: ${s.name}`);
    const described = policySays('crossBorder');
    if (described) details.push('В политике упоминается трансграничная передача — проверьте, что уведомление о ней подано в Роскомнадзор.');
    add('foreign_services', details, { services: names, meta }, onlyLight || described ? 'low' : 'medium');
  }

  if (webvisor && !policySays('analytics')) {
    if (policySilent('analytics')) {
      add('webvisor', ['В коде счётчика Яндекс Метрики включён параметр webvisor, а в политике не упоминаются ни Метрика, ни сервисы аналитики, ни cookie.']);
    } else if (policyOk) {
      add('webvisor', ['В коде счётчика Яндекс Метрики включён параметр webvisor. Текст политики автоматически прочитать не удалось — проверьте, что Метрика в ней описана.'], {}, 'low');
    } else {
      add('webvisor', ['В коде счётчика Яндекс Метрики включён параметр webvisor.']);
    }
  }

  if (analyticsCookies.length && !cookieMention) {
    add('cookies_no_notice', [`Cookie, установленные без согласия посетителя: ${analyticsCookies.join(', ')}`], { cookies: analyticsCookies.join(', ') });
  }

  if (pdForms.length && !result.requisites.inn.length && !result.requisites.ogrn.length) {
    add('no_requisites', ['ИНН и ОГРН не найдены ни на страницах сайта, ни в политике.']);
  }

  findings.sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);
  result.findings = findings;
  for (const f of findings) result.counts[f.severity]++;
  result.score = findings.reduce((s, f) => s + WEIGHT[f.severity], 0);

  // --- Справочная информация ---
  if (!pdForms.length) {
    result.info.push('На просмотренных страницах не найдено форм, собирающих имя, телефон или e-mail. Если заявки принимаются на других страницах или в мессенджерах, требования закона к ним тоже применяются.');
  }
  if (ruTrackers.length) {
    result.info.push(`Подключены российские сервисы: ${ruTrackers.map((s) => s.name).join(', ')}. Их тоже нужно перечислить в политике: какие данные они получают и зачем.`);
  }

  // --- Чек-лист ---
  const consentStatus = !pdForms.length ? 'na'
    : pdForms.some((f) => f.consent === 'none') ? 'fail'
      : pdForms.some((f) => f.consent !== 'checkbox') ? 'warn' : 'ok';
  const inn = result.requisites.inn[0];
  result.checklist = [
    { item: 'Сайт работает по HTTPS', status: https ? 'ok' : 'fail' },
    { item: 'Опубликована политика обработки персональных данных', status: !pdForms.length && !cands.policy.length ? 'na' : policyOk ? (findings.some((f) => f.id === 'policy_not_near_forms') ? 'warn' : 'ok') : 'fail' },
    { item: 'В формах есть активное согласие (галочка)', status: consentStatus },
    { item: 'Согласие оформлено отдельным документом', status: !pdForms.length ? 'na' : consentDocOk ? 'ok' : 'fail' },
    { item: 'Согласие на обработку не смешано с офертой', status: pdForms.some((f) => f.combined && f.consent !== 'none') ? 'warn' : pdForms.length ? 'ok' : 'na' },
    { item: 'Галочка согласия на рекламу не стоит заранее', status: pdForms.some((f) => f.adPre) ? 'fail' : 'ok' },
    { item: 'Заявки не уходят в иностранные сервисы', status: foreignForms.length ? 'fail' : 'ok' },
    { item: 'Нет иностранных сервисов аналитики, рекламы, капчи', status: !foreign.length ? 'ok' : foreign.every((s) => s.kind === 'fonts' || s.kind === 'video') ? 'warn' : 'fail' },
    { item: 'Посетителей предупреждают о cookie', status: cookieMention ? 'ok' : analyticsCookies.length ? 'warn' : 'na' },
    { item: 'Указаны реквизиты владельца (ИНН, ОГРН)', status: result.requisites.inn.length || result.requisites.ogrn.length ? 'ok' : 'warn' },
    {
      item: 'Подано уведомление в Роскомнадзор',
      status: 'manual',
      note: (inn ? `Проверьте ИНН ${inn}` : 'Проверьте по ИНН компании') +
        ' в реестре операторов на pd.rkn.gov.ru. С 30 мая 2025 года за неподачу уведомления — штраф до 300 тыс. ₽ (ч. 10 ст. 13.11 КоАП).',
    },
  ];

  return result;
}

module.exports = { analyze, docCandidates, linkKind, consentType, hostOf, stripWww, safeUrl, siteLabel, baseDomain, RULES, POLICY_RE, CONSENT_DOC_RE };
