#!/usr/bin/env node
'use strict';

// Экспресс-проверка сайтов по 20 пунктам: персональные данные, cookie, оферта и возврат,
// реклама и отзывы, удобство для всех, лицензии.
// Запуск: node scan.js sites.txt            - список сайтов из файла (по одному в строке)
//         node scan.js example.ru site.ru   - сайты прямо в командной строке

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { extractPageData, readTimers } = require('./lib/extract');
const { analyze, docCandidates, linkKind, stripWww, safeUrl } = require('./lib/analyze');
const { renderReport, renderLetter, renderIndex, renderCsv, plural } = require('./lib/report');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_TIMEOUT = 30000;
const SITE_TIMEOUT = 180000;

// Какие внутренние страницы смотреть в первую очередь: там обычно формы заявок.
const PRIORITY = [
  /(контакт|contact)/i,
  /(запис|заявк|консультац|consult|signup|register|регистрац|анкет)/i,
  /(курс|course|обучен|программ|program|тариф|price|цен|стоимост|услуг|service)/i,
  /(оплат|pay|checkout|корзин|cart|order|заказ)/i,
];

function help() {
  console.log(`
Проверка сайтов по 20 пунктам: персональные данные, cookie, оферта и возврат,
реклама и отзывы, удобство для всех, лицензии.

Как запустить:
  node scan.js <файл со списком сайтов | адреса сайтов...> [параметры]

Параметры:
  --out <папка>         куда сохранять результаты (по умолчанию: output)
  --concurrency <N>     сколько сайтов проверять одновременно (по умолчанию: 3)
  --pages <N>           сколько внутренних страниц смотреть на каждом сайте (по умолчанию: 3)
  --config <файл>       файл с вашими данными для отчётов (по умолчанию: config.json)

Примеры:
  node scan.js sites.txt
  node scan.js example.ru school.ru --pages 5
`);
}

function parseArgs(argv) {
  const opts = { inputs: [], out: 'output', concurrency: 3, pages: 3, config: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--concurrency' || a === '-c') opts.concurrency = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (a === '--pages') { const n = parseInt(argv[++i], 10); opts.pages = Number.isFinite(n) && n >= 0 ? n : 3; }
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '-h' || a === '--help') { help(); process.exit(0); }
    else opts.inputs.push(a);
  }
  return opts;
}

function normalizeUrl(s) {
  let v = String(s || '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  const u = safeUrl(v);
  if (!u || (!u.hostname.includes('.') && u.hostname !== 'localhost')) return null;
  return u.href;
}

function readSites(inputs) {
  const raw = [];
  for (const a of inputs) {
    if (fs.existsSync(a) && fs.statSync(a).isFile()) {
      for (const line of fs.readFileSync(a, 'utf8').split(/\r?\n/)) {
        const s = line.replace(/#.*/, '').trim();
        if (s) raw.push(s);
      }
    } else {
      raw.push(a);
    }
  }
  const seen = new Set();
  const sites = [];
  for (const s of raw) {
    const u = normalizeUrl(s);
    if (!u) { console.warn('Пропускаю непонятный адрес: ' + s); continue; }
    const key = u.replace(/\/+$/, '').replace('://www.', '://');
    if (seen.has(key)) continue;
    seen.add(key);
    sites.push(u);
  }
  return sites;
}

function loadConfig(p) {
  const candidates = p ? [p] : [path.join(__dirname, 'config.json'), path.join(__dirname, 'config.example.json')];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    if (path.basename(c) === 'config.example.json') {
      console.warn('Внимание: сейчас используется config.example.json. Скопируйте его в config.json и впишите свои данные, они попадут в отчёты и письма.');
    }
    return JSON.parse(fs.readFileSync(c, 'utf8'));
  }
  throw new Error('Не найден файл настроек config.json');
}

const shortErr = (e) => String((e && e.message) || e).split('\n')[0].replace(/^page\.goto: /, '').slice(0, 160);

function withTimeout(promise, ms, msg) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(msg)), ms); }),
  ]);
}

const decodeSafe = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

async function visit(page, url) {
  let resp;
  try {
    resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  } catch (e) {
    return { url, error: shortErr(e) };
  }
  const status = resp ? resp.status() : null;
  if (status && status >= 400) return { url: page.url(), status, error: `сайт ответил ошибкой ${status}` };
  await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
  // Прокрутка вниз: некоторые блоки и счётчики подгружаются только при скролле.
  await page.evaluate(() => window.scrollTo(0, document.body ? document.body.scrollHeight : 0)).catch(() => {});
  await page.waitForTimeout(1200);

  let data;
  try {
    data = await page.mainFrame().evaluate(extractPageData);
  } catch (e) {
    return { url: page.url(), status, error: 'не удалось прочитать страницу: ' + shortErr(e) };
  }
  // Формы во встроенных окнах (виджеты записи, GetCourse и т. п.).
  for (const fr of page.frames().slice(0, 12)) {
    if (fr === page.mainFrame()) continue;
    if (/youtube|vimeo|google\.com\/maps|yandex\.\w+\/map-widget|vk\.com\/video/i.test(fr.url())) continue;
    try {
      const sub = await fr.evaluate(extractPageData);
      for (const f of sub.forms) { f.frameUrl = fr.url(); data.forms.push(f); }
    } catch (e) { /* фрейм недоступен, пропускаем */ }
  }
  return { url: page.url(), status, data };
}

function pickPages(home, startUrl, n) {
  if (!home.data || n <= 0) return [];
  const start = safeUrl(home.url) || safeUrl(startUrl);
  const host = stripWww(start.hostname);
  const s0 = safeUrl(startUrl);
  // Если проверяем раздел (example.ru/school/), не уходим за его пределы.
  const prefix = s0.pathname.endsWith('/') ? s0.pathname : s0.pathname.replace(/[^/]*$/, '');
  const seen = new Set([start.origin + start.pathname, s0.origin + s0.pathname]);
  const cands = [];
  for (const l of home.data.links) {
    const u = safeUrl(l.href);
    if (!u || !/^https?:$/.test(u.protocol)) continue;
    if (stripWww(u.hostname) !== host) continue;
    if (!u.pathname.startsWith(prefix)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|7z|docx?|xlsx?|pptx?|mp4|mp3|avi|mov)$/i.test(u.pathname)) continue;
    const key = u.origin + u.pathname;
    if (seen.has(key)) continue;
    if (linkKind(l, host)) continue; // документы проверяются отдельно
    seen.add(key);
    const s = l.text + ' ' + decodeSafe(u.pathname);
    let score = 0;
    PRIORITY.forEach((re, i) => { if (re.test(s)) score = Math.max(score, PRIORITY.length - i); });
    cands.push({ url: key, score, order: cands.length });
  }
  cands.sort((a, b) => b.score - a.score || a.order - b.order);
  return cands.slice(0, n).map((c) => c.url);
}

// ---------- Документы ----------

const POLICY_TEXT_RE = /(политик[\s\S]{0,60}персональн|обработк[\s\S]{0,30}персональн|конфиденциальн)/i;
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
// Признак «это действительно нужный документ», отдельно для каждого типа.
const LOOKS_LIKE = {
  policy: /персональн/i,
  consent: /персональн/i,
  cookie: /(cookie|куки)/i,
  offer: /(оферт|договор)/i,
  refund: /возврат/i,
};
// Что ищем внутри документов.
const MENTIONS = {
  analytics: /(метрик|вебвизор|webvisor|metrica|аналитик)/i,
  cookie: /(cookie|куки)/i,
  crossBorder: /трансграничн/i,
  deletion: /(отзыв\S*\s+(\S+\s+){0,2}согласи|отозвать\s+(\S+\s+){0,2}согласи|(удалени|уничтожени)\S*\s+(\S+\s+){0,2}(персональн|данн|сведени)|прекращени\S*\s+(\S+\s+){0,2}обработк|прав\S*\s+на\s+удаление)/i,
  parent: /(законн\S*\s+представител|родител|опекун)/i,
  unsubscribe: /(отписа|отказаться\s+от\s+(получения|рассыл)|отзыв\S*\s+согласи\S*\s+на\s+(получение|рассыл)|unsubscribe)/i,
  refund: /возврат/i,
  autorenew: /(автопродл|автоматическ\S*\s+(продл|списан)|рекуррент|отключить\s+(подписку|автопл|автопрод)|отменить\s+подписку)/i,
};
const unknownMentions = () => Object.fromEntries(Object.keys(MENTIONS).map((k) => [k, null]));

// Скачиваем документ и проверяем, что он открывается и похож на настоящий.
// Если это раздел со списком документов («Правовая информация»), переходим по ссылке на саму политику.
async function checkDoc(context, href, kind, depth = 0) {
  try {
    const r = await context.request.get(href, { timeout: 15000, maxRedirects: 5, failOnStatusCode: false });
    const status = r.status();
    if (status >= 400) return { ok: false, status };
    const ct = (r.headers()['content-type'] || '').toLowerCase();
    // PDF и Word не читаем: документ есть, но что в нём написано, неизвестно.
    if (/pdf|msword|officedocument/.test(ct) || /\.(pdf|docx?)$/i.test(new URL(r.url()).pathname)) {
      return { ok: true, status, reqText: [], mentions: unknownMentions() };
    }
    const html = decodeBody(await r.body(), ct);
    const result = readDocHtml(html, status, kind);
    if (depth === 0 && kind === 'policy') {
      const link = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map((m) => ({ href: m[1], text: stripTags(m[2]) }))
        .find((l) => POLICY_TEXT_RE.test(l.text) && !/согласи/i.test(l.text) && !/^(#|mailto:|tel:|javascript:)/i.test(l.href));
      if (link) {
        let abs = null;
        try { abs = new URL(link.href, r.url()).href.split('#')[0]; } catch (e) { /* битая ссылка */ }
        if (abs && abs !== r.url().split('#')[0]) {
          const sub = await checkDoc(context, abs, kind, 1);
          if (sub.ok) {
            result.ok = true;
            result.reqText.push(...(sub.reqText || []));
            // Эта страница - список документов, а сама политика лежит по ссылке. Поэтому «в тексте этого нет»
            // решаем только по самой политике: если она в PDF, честно считаем содержание неизвестным.
            for (const k of Object.keys(result.mentions)) {
              const a = result.mentions[k];
              const b = sub.mentions[k];
              result.mentions[k] = a === true || b === true ? true : b === false ? false : null;
            }
          }
        }
      }
    }
    return result;
  } catch (e) {
    return { ok: false, error: shortErr(e) };
  }
}

// Старые сайты (часто на 1С-Битрикс) отдают страницы в windows-1251. Без перекодировки
// слово «персональных» превратится в кракозябры.
function decodeBody(buf, contentType) {
  let charset = (/charset=([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!charset) {
    const head = buf.subarray(0, 4096).toString('latin1');
    charset = (/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head) || [])[1];
  }
  charset = (charset || 'utf-8').toLowerCase();
  if (charset === 'cp1251') charset = 'windows-1251';
  try { return new TextDecoder(charset).decode(buf); } catch (e) { return buf.toString('utf8'); }
}

// Текст документа: открывается ли он, какие в нём реквизиты и что в нём сказано.
function readDocHtml(html, status, kind = 'policy') {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ');
  const reqText = [...text.matchAll(/(ИНН(?:\s*\/\s*КПП)?|ОГРН(?:ИП)?)\s*[:№]?\s*(\d{10,15})/gi)]
    .slice(0, 20).map((m) => m[1] + ' ' + m[2]);
  const re = LOOKS_LIKE[kind] || LOOKS_LIKE.policy;
  // Короткий текст без ключевых слов - скорее всего, страница рисуется скриптом: не считаем её битой.
  const ok = re.test(text) || text.length < 1500;
  // Прямое упоминание засчитываем всегда (true). Вывод «не упоминается» (false) делаем только
  // по полноценному тексту документа, иначе - «неизвестно» (null).
  const full = re.test(text) && text.length >= 1500;
  const mentions = Object.fromEntries(Object.entries(MENTIONS).map(([k, r]) => [k, r.test(text) ? true : full ? false : null]));
  return { ok, status, reqText, mentions };
}

// ---------- Таймер и клавиатура ----------

// Таймер на главной: тикает ли он по секундам. Неподвижные таймеры (только дни или часы) не проверяем.
async function readTimerTick(page) {
  try {
    const a = await page.evaluate(readTimers);
    if (!a.length) return null;
    await page.waitForTimeout(2100);
    const b = await page.evaluate(readTimers);
    if (!b.length) return null;
    return { text: b[0], at: Date.now(), ticking: a[0] !== b[0] };
  } catch (e) {
    return null;
  }
}

function timerSeconds(text) {
  const nums = (String(text).match(/\d+/g) || []).map(Number);
  if (nums.length < 2 || nums.some((n) => n > 999)) return null;
  const [s = 0, m = 0, hh = 0, d = 0] = nums.slice(-4).reverse();
  return d * 86400 + hh * 3600 + m * 60 + s;
}

// Повторный заход «новым посетителем»: настоящий таймер к этому времени уменьшится на прошедшие секунды,
// а фальшивый начнёт отсчёт заново и покажет почти то же самое, что в первый раз.
async function timerRecheck(browser, url, first) {
  // Между заходами должно пройти хотя бы 6 секунд, иначе настоящий и фальшивый таймеры не различить.
  const wait = 6500 - (Date.now() - first.at);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const ctx = await browser.newContext({ locale: 'ru-RU', userAgent: UA, viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const texts = await page.evaluate(readTimers);
    if (!texts.length) return null;
    const second = { text: texts[0], at: Date.now() };
    const v1 = timerSeconds(first.text);
    const v2 = timerSeconds(second.text);
    const delta = Math.round((second.at - first.at) / 1000);
    if (!v1 || !v2 || delta < 6) return null;
    return { first: first.text, second: second.text, delta, evergreen: Math.abs(v2 - v1) < delta / 2 };
  } catch (e) {
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// Пройдём по главной клавишей Tab: двигается ли фокус и видно ли, где он.
async function keyboardCheck(page) {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
    const seen = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible = r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
        const outline = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
        return { key: el.tagName + '|' + (el.getAttribute('href') || '') + '|' + (el.innerText || '').trim().slice(0, 30), visible, outline };
      });
      if (info) seen.push(info);
    }
    const visible = seen.filter((x) => x.visible);
    return {
      focused: seen.length,
      distinct: new Set(seen.map((x) => x.key)).size,
      visibleFocused: visible.length,
      noOutline: visible.filter((x) => !x.outline).length,
    };
  } catch (e) {
    return null;
  }
}

// ---------- Проверка одного сайта ----------

const DOC_LIMITS = { policy: 3, consent: 2, cookie: 1, offer: 2, refund: 1 };

async function scanSite(browser, startUrl, opts = {}) {
  const maxPages = opts.pages != null ? opts.pages : 3;
  const scannedAt = new Date().toISOString();
  const context = await browser.newContext({
    locale: 'ru-RU',
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const requests = new Set();
  context.on('request', (req) => { if (requests.size < 8000) requests.add(req.url()); });
  const page = await context.newPage();
  const pages = [];
  let keyboard = null;
  let timerFirst = null;
  try {
    let home = await visit(page, startUrl);
    if (home.error && /^https:/i.test(startUrl)) {
      const alt = await visit(page, startUrl.replace(/^https:/i, 'http:'));
      if (!alt.error) home = alt;
    }
    pages.push(home);
    if (!home.error) {
      timerFirst = await readTimerTick(page);
      keyboard = await keyboardCheck(page);
      for (const u of pickPages(home, startUrl, maxPages)) pages.push(await visit(page, u));
    }
    const cookies = (await context.cookies()).map((c) => ({ name: c.name, domain: c.domain }));
    const docs = {};
    if (!home.error) {
      const cands = docCandidates(pages.filter((p) => p.data));
      for (const [kind, limit] of Object.entries(DOC_LIMITS)) {
        for (const c of cands[kind].filter((x) => !x.popup).slice(0, limit)) {
          if (!docs[c.key]) docs[c.key] = await checkDoc(context, c.href, kind);
        }
      }
    }
    const timer = timerFirst && timerFirst.ticking ? await timerRecheck(browser, home.url, timerFirst) : null;
    return analyze({ input: startUrl, startUrl, scannedAt, pages, cookies, requests: [...requests], docs, keyboard, timer });
  } finally {
    await context.close().catch(() => {});
  }
}

const slugify = (s) => String(s).replace(/[^a-z0-9а-яё.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'site';

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.inputs.length) { help(); process.exit(1); }
  const cfg = loadConfig(opts.config);
  const sites = readSites(opts.inputs);
  if (!sites.length) { console.error('Список сайтов пуст.'); process.exit(1); }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const outDir = path.resolve(opts.out, stamp);
  fs.mkdirSync(path.join(outDir, 'reports'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'letters'), { recursive: true });

  console.log(`Проверяю сайтов: ${sites.length} (одновременно: ${opts.concurrency}, внутренних страниц на сайт: ${opts.pages})`);
  const browser = await chromium.launch();
  const queue = sites.map((u, i) => ({ u, i }));
  const results = new Array(sites.length);
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const { u, i } = queue.shift();
      let r;
      try {
        r = await withTimeout(scanSite(browser, u, opts), SITE_TIMEOUT, 'проверка заняла слишком много времени');
      } catch (e) {
        r = analyze({ input: u, startUrl: u, scannedAt: new Date().toISOString(), pages: [], error: shortErr(e) });
      }
      results[i] = r;
      done++;
      const n = r.findings.length;
      console.log(`[${done}/${sites.length}] ${r.site}: ` + (r.ok
        ? `${n} ${plural(n, ['замечание', 'замечания', 'замечаний'])} (серьёзных: ${r.counts.high}), баллы: ${r.score}`
        : `ошибка: ${r.error}`));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, sites.length) }, worker));
  await browser.close();

  results.sort((a, b) => (Number(b.ok) - Number(a.ok)) || (b.score - a.score));
  const files = {};
  for (const r of results) {
    if (!r.ok) continue;
    const slug = slugify(r.site);
    files[r.site] = { report: `reports/${slug}.html` };
    fs.writeFileSync(path.join(outDir, files[r.site].report), renderReport(r, cfg));
    const letter = renderLetter(r, cfg, `${slug}.html`);
    if (letter) {
      files[r.site].letter = `letters/${slug}.txt`;
      fs.writeFileSync(path.join(outDir, files[r.site].letter), letter);
    }
  }
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, 'leads.csv'), renderCsv(results, files));
  fs.writeFileSync(path.join(outDir, 'index.html'), renderIndex(results, cfg, files));

  const ok = results.filter((r) => r.ok);
  console.log(`\nГотово. Проверено: ${ok.length} из ${results.length}. С серьёзными нарушениями: ${ok.filter((r) => r.counts.high).length}.`);
  console.log(`Результаты: ${outDir}`);
  console.log('  index.html - сводная таблица, leads.csv - для Excel, reports/ - отчёты для клиентов, letters/ - черновики писем');
}

module.exports = { scanSite, normalizeUrl, readSites, pickPages, timerSeconds };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
