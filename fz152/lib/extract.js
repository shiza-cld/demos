'use strict';

// Эта функция выполняется ВНУТРИ браузера на каждой странице и в каждом фрейме.
// Она должна быть самодостаточной: Playwright передаёт в браузер только её текст,
// поэтому внешние переменные и require здесь использовать нельзя.
function extractPageData() {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // Текст элемента без <style>/<script> (Tilda кладёт CSS прямо в блоки), узлы через пробел,
  // чтобы соседние блоки не склеивались («ОГРНИП 3217…info@site.ru»).
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

  // Поля внутри карт (поиск по адресу в Яндекс/Google картах) — не формы заявок.
  const MAP_SEL = '[class*="ymaps"], .gm-style, .leaflet-container, .mapboxgl-map, [class*="map-widget"], [class*="yandex-map"]';
  const inMap = (el) => !!el.closest(MAP_SEL);

  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color', 'password', 'search']);
  const PD_RE = /(phone|телефон|e-?mail|почт|имя|name|фамили|отчеств|whatsapp|telegram|адрес|address|рожден|паспорт|снилс)/i;
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
    if (/(whatsapp|telegram)/.test(s)) return 'мессенджер';
    if (TEL_RE.test(s) || /(phone|телефон)/.test(s)) return 'телефон';
    if (/(e-?mail|почт)/.test(s)) return 'e-mail';
    if (/(фамили|отчеств|имя|name)/.test(s)) return 'имя';
    if (/(адрес|address)/.test(s)) return 'адрес';
    if (/(рожден|bday)/.test(s)) return 'дата рождения';
    if (/(паспорт|снилс)/.test(s)) return 'паспортные данные';
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
      // GetCourse и др. держат в форме скрытые служебные копии галочек (0×0) — их состояние не то, что видит человек.
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
  // Поля вне <form> (формы на div'ах в React/Vue/конструкторах): группируем по блоку.
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

  const links = [...document.querySelectorAll('a[href]')].slice(0, 3000).map((a) => ({
    href: a.href,
    raw: a.getAttribute('href') || '',
    text: norm(a.innerText || a.textContent || a.getAttribute('title') || a.getAttribute('aria-label')).slice(0, 150),
  }));

  // Из <link> берём только стили: preconnect/dns-prefetch не означают, что сервис реально используется.
  const resources = [...document.querySelectorAll('script[src], link[rel~="stylesheet"][href], iframe[src], iframe[data-src], img[src], embed[src]')]
    .slice(0, 800)
    .map((el) => el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data-src') || '')
    .filter(Boolean)
    .map((u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } })
    .filter(Boolean);

  const inline = [...document.scripts].filter((s) => !s.src).map((s) => s.textContent).join('\n').slice(0, 500000);
  const webvisor = /webvisor\s*["']?\s*:\s*(true|1|!0)/i.test(inline);

  // Упоминание cookie в видимом тексте (плашка, баннер, ссылка в подвале).
  let cookieMention = false;
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; let i = 0;
    while ((n = walker.nextNode()) && i++ < 20000) {
      if (/(cookie|куки)/i.test(n.nodeValue) && isVisible(n.parentElement)) { cookieMention = true; break; }
    }
  }

  // Полный текст (включая скрытые попапы Tilda) нужен только для поиска реквизитов и e-mail.
  const fullText = document.body ? textOf(document.body, 300000) : '';
  const visibleText = document.body ? norm(document.body.innerText).slice(0, 30000) : '';

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
    reqText,
    emails: [...emails].slice(0, 50),
    textLength: visibleText.length,
  };
}

module.exports = { extractPageData };
