'use strict';

// Эта функция выполняется ВНУТРИ браузера на каждой странице и в каждом фрейме.
// Она должна быть самодостаточной: Playwright передаёт в браузер только её текст,
// поэтому внешние переменные и require здесь использовать нельзя.
function extractPageData() {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  // Обрезка по границе слова, чтобы в отчёте не было «керамист Кол».
  const cut = (s, n) => {
    const t = norm(s);
    if (t.length <= n) return t;
    const part = t.slice(0, n);
    const sp = part.lastIndexOf(' ');
    return (sp > n * 0.5 ? part.slice(0, sp) : part) + '…';
  };

  // Текст элемента без <style>/<script> (Tilda кладёт CSS прямо в блоки). Узлы склеиваем через пробел,
  // чтобы соседние блоки не слипались («ОГРНИП 3217...info@site.ru»).
  const SKIP_TEXT = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
  const textOf = (el, limit = 300000) => {
    if (!el) return '';
    const parts = [];
    let len = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        for (let p = n.parentElement; p && p !== el.parentElement; p = p.parentElement) {
          if (SKIP_TEXT.has(p.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode()) && len < limit) {
      const t = n.nodeValue.trim();
      if (t) { parts.push(t); len += t.length + 1; }
    }
    return norm(parts.join(' ')).slice(0, limit);
  };

  // Поля внутри карт (поиск по адресу в Яндекс или Google картах) - это не формы заявок.
  const MAP_SEL = '[class*="ymaps"], .gm-style, .leaflet-container, .mapboxgl-map, [class*="map-widget"], [class*="yandex-map"]';
  const inMap = (el) => !!el.closest(MAP_SEL);

  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // ---------- Формы ----------

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color', 'password', 'search']);
  const PD_RE = /(phone|телефон|e-?mail|почт|имя|name|фамили|отчеств|whatsapp|telegram|адрес|address|рожден|паспорт|passport|снилс|snils)/i;
  const TEL_RE = /(^|[^a-z])tel([^a-z]|$)/i;

  const labelOf = (el) => {
    let t = '';
    if (el.id) {
      try {
        const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (l) t = textOf(l, 400);
      } catch (e) { /* некорректный id */ }
    }
    if (!t) {
      const l = el.closest('label');
      if (l) t = textOf(l, 400);
    }
    if (!t) t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    return norm(t).slice(0, 200);
  };

  const fieldOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const defType = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text';
    return {
      type: (el.getAttribute('type') || defType).toLowerCase(),
      name: el.getAttribute('name') || '',
      placeholder: el.getAttribute('placeholder') || '',
      inputmode: (el.getAttribute('inputmode') || '').toLowerCase(),
      autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
      label: labelOf(el),
    };
  };

  const isPd = (f) => {
    if (SKIP_TYPES.has(f.type)) return false;
    if (f.type === 'tel' || f.type === 'email') return true;
    if (f.inputmode === 'tel' || f.inputmode === 'email') return true;
    if (/^(tel|email|name|given-name|family-name|additional-name|street-address|bday)/.test(f.autocomplete)) return true;
    const s = [f.name, f.placeholder, f.label].join(' ');
    if (/(search|поиск|query)/i.test(s) || /^(q|s)$/i.test(f.name)) return false;
    return PD_RE.test(s) || TEL_RE.test(f.name);
  };

  const fieldKind = (f) => {
    const s = [f.type, f.inputmode, f.autocomplete, f.name, f.placeholder, f.label].join(' ').toLowerCase();
    if (/(снилс|snils)/.test(s)) return 'СНИЛС';
    if (/(паспорт|passport)/.test(s)) return 'паспортные данные';
    if (/(whatsapp|telegram)/.test(s)) return 'мессенджер';
    if (TEL_RE.test(s) || /(phone|телефон)/.test(s)) return 'телефон';
    if (/(e-?mail|почт)/.test(s)) return 'e-mail';
    if (/(рожден|bday)/.test(s)) return 'дата рождения';
    if (/(фамили|отчеств|имя|name)/.test(s)) return 'имя';
    if (/(адрес|address)/.test(s)) return 'адрес';
    return norm(f.label || f.placeholder || f.name).slice(0, 40) || 'поле';
  };

  // Блок вокруг формы: в Tilda это запись .t-rec, иначе секция, попап или «дедушка» формы.
  const blockOf = (el) =>
    el.closest('.t-rec, section, [class*="popup"], [class*="modal"]') ||
    (el.parentElement && el.parentElement.parentElement) || el;

  const linksIn = (root) => [...root.querySelectorAll('a[href]')].slice(0, 30).map((a) => ({
    href: a.href,
    text: norm(a.innerText || a.textContent).slice(0, 150),
  }));

  const describeForm = (root, inputs, isOrphan) => {
    const fields = inputs.filter((el) => !inMap(el)).map(fieldOf);
    const pd = fields.filter(isPd);
    const checkboxes = [...root.querySelectorAll('input[type=checkbox]')].filter((cb) => !inMap(cb)).map((cb) => ({
      label: labelOf(cb) || textOf(cb.parentElement, 200),
      checked: !!(cb.checked || cb.hasAttribute('checked')),
      required: !!cb.required,
      // GetCourse и другие держат в форме скрытые служебные копии галочек (0×0): их состояние не то, что видит человек.
      visible: isVisible(cb) || isVisible(cb.closest('label')),
    }));
    const block = blockOf(root);
    return {
      isOrphan,
      visible: isVisible(root),
      action: root.getAttribute ? (root.getAttribute('action') || '') : '',
      fields: [...new Set(pd.map(fieldKind))],
      pdCount: pd.length,
      fieldCount: fields.length,
      checkboxes,
      formText: textOf(root, 2000),
      blockText: textOf(block, 4000),
      links: linksIn(root === block ? root : block),
    };
  };

  const FIELD_SEL = 'input, textarea, select';
  const forms = [];
  for (const f of document.querySelectorAll('form')) {
    forms.push(describeForm(f, [...f.querySelectorAll(FIELD_SEL)], false));
  }
  // Поля вне <form> (формы на div'ах в React, Vue, конструкторах): группируем по блоку.
  const orphanGroups = new Map();
  for (const el of document.querySelectorAll(FIELD_SEL)) {
    if (el.closest('form') || inMap(el)) continue;
    const f = fieldOf(el);
    if (!isPd(f)) continue;
    const block = blockOf(el);
    if (!orphanGroups.has(block)) orphanGroups.set(block, []);
    orphanGroups.get(block).push(el);
  }
  for (const [block, inputs] of orphanGroups) forms.push(describeForm(block, inputs, true));

  // ---------- Ссылки и подключённые ресурсы ----------

  const links = [...document.querySelectorAll('a[href]')].slice(0, 3000).map((a) => ({
    href: a.href,
    raw: a.getAttribute('href') || '',
    text: norm(a.innerText || a.textContent || a.getAttribute('title') || a.getAttribute('aria-label')).slice(0, 150),
  }));

  // Из <link> берём только стили: preconnect и dns-prefetch не значат, что сервис реально используется.
  const resources = [...document.querySelectorAll('script[src], link[rel~="stylesheet"][href], iframe[src], iframe[data-src], img[src], embed[src]')]
    .slice(0, 800)
    .map((el) => el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data-src') || '')
    .filter(Boolean)
    .map((u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } })
    .filter(Boolean);

  const inline = [...document.scripts].filter((s) => !s.src).map((s) => s.textContent).join('\n').slice(0, 500000);
  const webvisor = /webvisor\s*["']?\s*:\s*(true|1|!0)/i.test(inline);

  // ---------- Cookie: упоминание и баннер ----------
  // Упоминание - любой видимый текст про cookie (хоть ссылка в подвале).
  // Баннер - такой текст в закреплённом блоке или рядом с кнопкой «Принять / Понятно».
  let cookieMention = false;
  let cookieBanner = false;
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const ACCEPT_RE = /^(принять|принимаю|согласен|согласна|понятно|хорошо|ок|ok|accept|закрыть|да)/i;
    let n; let i = 0;
    while ((n = walker.nextNode()) && i++ < 20000 && !cookieBanner) {
      if (!/(cookie|куки)/i.test(n.nodeValue) || !isVisible(n.parentElement)) continue;
      cookieMention = true;
      let p = n.parentElement;
      for (let depth = 0; p && p !== document.body && depth < 8; depth++, p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === 'fixed' || pos === 'sticky') { cookieBanner = true; break; }
        const len = (p.innerText || '').length;
        if (len < 700 && [...p.querySelectorAll('button, a, [role="button"]')].some((b) => ACCEPT_RE.test(norm(b.innerText)))) {
          cookieBanner = true; break;
        }
      }
    }
  }

  // ---------- Тексты ----------
  // Полный текст (включая скрытые попапы Tilda) нужен для реквизитов и e-mail,
  // видимый - для поиска обещаний, приёмов давления, цен и т. п.
  const fullText = document.body ? textOf(document.body, 300000) : '';
  const visibleText = document.body ? norm(document.body.innerText).slice(0, 40000) : '';

  const reqText = [];
  for (const m of fullText.matchAll(/(ИНН(?:\s*\/\s*КПП)?|ОГРН(?:ИП)?)\s*[:№]?\s*(\d{10,15})/gi)) {
    reqText.push(m[1].toUpperCase().replace(/\s/g, '') + ' ' + m[2]);
    if (reqText.length > 20) break;
  }

  const emails = new Set();
  for (const l of links) {
    if (/^mailto:/i.test(l.raw)) {
      try { emails.add(decodeURIComponent(l.raw.replace(/^mailto:/i, '').split('?')[0]).trim().toLowerCase()); } catch (e) { /* битый mailto */ }
    }
  }
  for (const e of fullText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) emails.add(e.toLowerCase());

  // ---------- Картинки без описания (alt) ----------
  const imgs = [...document.images].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.width >= 40 && r.height >= 40 && isVisible(img);
  });
  const imgName = (img) => {
    try { return decodeURIComponent(new URL(img.currentSrc || img.src, location.href).pathname.split('/').pop()).slice(0, 60); } catch (e) { return ''; }
  };
  const noAlt = imgs.filter((img) => !img.hasAttribute('alt'));
  const emptyAlt = imgs.filter((img) => img.hasAttribute('alt') && !img.getAttribute('alt').trim());
  const images = {
    total: imgs.length,
    noAlt: noAlt.length,
    emptyAlt: emptyAlt.length,
    examples: noAlt.concat(emptyAlt).slice(0, 4).map(imgName).filter(Boolean),
  };

  // ---------- Контраст текста ----------
  const parseColor = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const blend = (top, bottom) => {
    const a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // Фон под элементом: идём вверх по родителям. Если по дороге картинка, градиент или «плавающий» слой
  // без своего фона, настоящий фон узнать нельзя, и такой текст пропускаем.
  const bgOf = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parseColor(cs.backgroundColor);
      if ((cs.position === 'absolute' || cs.position === 'fixed') && !(c && c[3] >= 1)) return null;
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };
  const contrast = { checked: 0, failing: [] };
  if (document.body) {
    const seen = new Set();
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let tn; let guard = 0;
    while ((tn = tw.nextNode()) && guard++ < 20000 && contrast.checked < 500) {
      const t = tn.nodeValue.trim();
      if (t.length < 3) continue;
      const el = tn.parentElement;
      if (!el || seen.has(el) || SKIP_TEXT.has(el.tagName.toUpperCase())) continue;
      seen.add(el);
      if (!isVisible(el)) continue;
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      if (!fg || fg[3] === 0) continue;
      const bg = bgOf(el);
      if (!bg) continue;
      const fgc = fg[3] < 1 ? blend(fg, bg) : fg;
      const l1 = lum(fgc);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      contrast.checked++;
      // Почти одинаковые цвета обычно значат, что текст лежит на картинке или соседнем слое: не судим.
      if (ratio < 1.5) continue;
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need && contrast.failing.length < 20) {
        contrast.failing.push({ text: cut(t, 40), ratio: Math.round(ratio * 10) / 10, fg: hex(fgc), bg: hex(bg) });
      }
    }
  }

  // ---------- Клавиатура: кнопки, до которых нельзя дойти клавишей Tab ----------
  const clickableNoFocus = [...document.querySelectorAll('[onclick], [role="button"], [role="link"]')]
    .filter((el) => !el.matches('a[href], button, input, select, textarea, summary, [tabindex]') && isVisible(el));
  const keyboard = {
    clickableNoFocus: clickableNoFocus.length,
    examples: clickableNoFocus.map((el) => cut(el.innerText, 40)).filter(Boolean).slice(0, 3),
  };

  // ---------- Веб-шрифты, которые реально загрузились ----------
  const webFonts = new Set();
  try {
    document.fonts.forEach((f) => { if (f.status === 'loaded') webFonts.add(f.family.replace(/["']/g, '').trim()); });
  } catch (e) { /* старый браузер */ }

  // ---------- Отзывы ----------
  const REVIEW_HEAD = /^(отзыв|что говорят|истории (учеников|выпускников|клиентов)|нам доверяют|результаты учеников)/i;
  const REVIEW_SEL = '[class*="review" i], [class*="otzyv" i], [class*="testimonial" i]';
  const hasReviews = [...document.querySelectorAll('h1, h2, h3, h4, [class*="title"]')]
    .some((el) => REVIEW_HEAD.test(norm(el.innerText || el.textContent))) ||
    !!document.querySelector(REVIEW_SEL + ', [id*="review" i], [id*="otzyv" i]');
  // Повторы ищем только вне слайдеров: карусели сами дублируют слайды для бесконечной прокрутки.
  const SLIDER = '[class*="slick" i], [class*="swiper" i], [class*="slide" i], [class*="carousel" i], [class*="owl" i], [class*="glide" i], [class*="splide" i], [class*="flickity" i], [class*="t-slds" i]';
  const reviewTexts = new Map();
  for (const el of document.querySelectorAll(REVIEW_SEL)) {
    if (el.querySelector(REVIEW_SEL)) continue; // берём только самые вложенные блоки
    if (el.closest(SLIDER) || el.closest('[aria-hidden="true"]')) continue;
    const t = textOf(el, 2000);
    if (t.length < 80) continue;
    reviewTexts.set(t, (reviewTexts.get(t) || 0) + 1);
  }
  const duplicateReviews = [...reviewTexts.values()].filter((n) => n > 1).length;

  const generator = (document.querySelector('meta[name="generator"]') || {}).content || '';
  const isTilda = !!document.getElementById('allrecords') || /tilda/i.test(generator) ||
    resources.some((u) => /tildacdn\.|tilda\.ws/.test(u));

  return {
    url: location.href,
    protocol: location.protocol,
    title: norm(document.title).slice(0, 200),
    lang: document.documentElement.lang || '',
    generator,
    isTilda,
    forms,
    links,
    resources,
    webvisor,
    cookieMention,
    cookieBanner,
    reqText,
    emails: [...emails].slice(0, 50),
    visibleText,
    textLength: visibleText.length,
    images,
    contrast,
    keyboard,
    webFonts: [...webFonts].slice(0, 30),
    hasReviews,
    duplicateReviews,
  };
}

// Таймеры обратного отсчёта на странице (тоже выполняется в браузере).
function readTimers() {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const out = [];
  const sel = '[class*="timer" i], [id*="timer" i], [class*="countdown" i], [id*="countdown" i], [class*="count-down" i]';
  for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || !r.width || !r.height) continue;
    const t = norm(el.innerText);
    const nums = t.match(/\d+/g);
    if (!nums || nums.length < 2 || t.length > 120) continue;
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

module.exports = { extractPageData, readTimers };
