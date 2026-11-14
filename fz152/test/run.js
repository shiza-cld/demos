'use strict';

// Проверка сканера на тестовых страницах: node test/run.js (или npm test)
// Поднимает локальный сервер с test/fixtures и сверяет найденные замечания с ожидаемыми.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const os = require('os');
const { scanSite, writeOutputs, loadPrevious } = require('../scan');
const { innValid, ogrnValid } = require('../lib/inn');
const { linkKind } = require('../lib/analyze');

const ROOT = path.join(__dirname, 'fixtures');
// Для проверки платных шрифтов тестовый сервер отдаёт системный шрифт под именем Gilroy.
// Если такого файла на машине нет, эту часть проверки пропускаем.
const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']
  .find((f) => fs.existsSync(f));

const CASES = {
  good: { has: ['no_https'], not: ['no_policy', 'policy_broken', 'no_consent', 'consent_passive', 'consent_prechecked', 'no_consent_doc', 'no_requisites', 'foreign_forms', 'foreign_services', 'webvisor'] },
  bad: { has: ['no_policy', 'no_consent', 'no_consent_doc', 'foreign_forms', 'foreign_services', 'no_requisites'], not: ['consent_passive'] },
  passive: { has: ['consent_passive', 'no_consent_doc', 'webvisor'], not: ['no_policy', 'no_consent', 'policy_broken', 'no_requisites'], platform: 'Tilda' },
  prechecked: { has: ['consent_prechecked', 'no_consent_doc'], not: ['no_consent', 'no_policy', 'policy_broken'] },
  broken: { has: ['policy_broken'], not: ['no_policy', 'no_consent', 'no_consent_doc'] },
  orphan: { has: ['no_consent', 'no_policy'], not: [] },
  // Галочка ПДн не отмечена, а галочка рекламы отмечена заранее - это нарушение закона «О рекламе», а не 152-ФЗ.
  adbox: { has: ['ad_prechecked'], not: ['consent_prechecked', 'no_consent', 'no_consent_doc', 'no_policy'] },
  // Политика доступна через «Правовая информация»; ссылки на yandex.ru/legal - не политика сайта;
  // Метрика описана в документах - Вебвизор не ругаем.
  // Оферта тоже лежит в разделе документов: «нет оферты» и «нет правил возврата» не пишем.
  legalhub: { has: [], not: ['no_policy', 'policy_broken', 'no_consent', 'no_consent_doc', 'webvisor', 'no_offer', 'no_refund'] },
  // Поле поиска в карте - не форма заявки.
  map: { has: [], not: ['no_consent', 'no_policy', 'no_consent_doc'] },
  // GetCourse: видимые галочки не отмечены, отмеченные - скрытые служебные копии; согласие склеено с офертой.
  getcourse: { has: ['consent_combined'], not: ['consent_prechecked', 'ad_prechecked', 'no_consent'] },
  // Политика - PDF за разделом «Документы»: текст неизвестен, поэтому Вебвизор только «незначительно».
  pdfhub: { has: ['webvisor'], not: ['no_policy', 'policy_broken', 'no_consent_doc', 'no_deletion_info'], severity: { webvisor: 'low' } },
  // Политика в кодировке windows-1251 - не «битая».
  cp1251: { has: [], not: ['policy_broken', 'no_policy'] },
  // Магазин со всеми нарушениями сразу: фальшивый таймер, давление, обещания, платная галочка, нет оферты и возврата.
  shop: {
    has: ['no_offer', 'no_refund', 'hidden_paid_option', 'autorenew_unclear', 'dark_timer', 'dark_patterns', 'empty_promises',
      'reviews_duplicates', 'img_no_alt', 'low_contrast', 'keyboard_nav', 'stock_hotlink', 'cookies_no_notice']
      .concat(FONT ? ['paid_fonts'] : []),
    not: ['no_consent', 'consent_prechecked', 'ad_prechecked'],
  },
  // Детская школа: нет согласия родителей, просят паспорт, нет отписки, фото со стока по имени файла.
  kids: { has: ['children_consent', 'excess_data', 'no_unsubscribe', 'stock_names'], not: ['no_consent', 'no_policy'] },
  // Форма в виджете (встроенном окне) без галочки, а слова о согласии стоят рядом на странице: это «согласие фразой», а не «без согласия».
  frames: { has: ['consent_passive'], not: ['no_consent', 'no_policy'] },
  // Политика и согласие указаны только внутри виджета (на самой странице ссылок нет), поле названо «Эл. адрес».
  frames2: { has: [], not: ['no_policy', 'no_consent', 'no_consent_doc', 'excess_data'] },
  // Честный магазин: оферта, возврат, автопродление, баннер cookie, настоящий таймер, форма входа без галочки. Ничего лишнего.
  shopgood: {
    has: [],
    not: ['no_consent', 'no_offer', 'no_refund', 'autorenew_unclear', 'dark_timer', 'dark_patterns', 'empty_promises', 'cookies_no_notice',
      'no_cookie_policy', 'no_deletion_info', 'no_unsubscribe', 'img_no_alt', 'low_contrast', 'keyboard_nav', 'webvisor',
      'hidden_paid_option', 'ad_prechecked', 'no_consent_doc', 'consent_passive', 'reviews_duplicates'],
  },
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/font.ttf' && FONT) { res.writeHead(200, { 'content-type': 'font/ttf' }); res.end(fs.readFileSync(FONT)); return; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    const type = file.endsWith('.pdf') ? 'application/pdf' : /cp1251/.test(file) ? 'text/html' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'content-type': type });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  let failed = 0;
  const check = (cond, msg) => { if (!cond) { failed++; console.log('  ✕ ' + msg); } };

  console.log('ИНН/ОГРН:');
  check(innValid('7700000016'), 'валидный ИНН юрлица не прошёл проверку');
  check(!innValid('7700000017'), 'невалидный ИНН прошёл проверку');
  check(innValid('770000000156'), 'валидный ИНН ИП не прошёл проверку');
  check(ogrnValid('1027700000019'), 'валидный ОГРН не прошёл проверку');
  check(!ogrnValid('1027700000010'), 'невалидный ОГРН прошёл проверку');
  console.log(failed ? '' : '  ✓ контрольные суммы');

  console.log('типы ссылок на документы:');
  {
    const before = failed;
    const kind = (href, text) => linkKind({ href, text }, 'x.ru');
    check(kind('https://x.ru/terms-of-use/4/', 'Политика обработки данных') === 'policy', 'текст ссылки должен быть важнее адреса: «Политика» по адресу terms-of-use');
    check(kind('https://x.ru/polzovatelskoe-soglashenie', 'Пользовательское соглашение') === 'offer', 'пользовательское соглашение - это оферта, а не согласие');
    check(kind('https://x.ru/privacy_soglasie', '') === 'consent', 'soglasie в адресе - это согласие');
    check(kind('https://yandex.ru/legal/maps_termsofuse/', 'Условия использования') === null, 'условия Яндекс Карт - не оферта сайта');
    check(kind('https://disk.yandex.ru/i/abc', 'Договор-оферта') === 'offer', 'оферта на Яндекс Диске - документ сайта');
    check(kind('https://school.getcourse.ru/oferta', 'Оферта') === 'offer', 'оферта на поддомене GetCourse - документ школы');
    check(kind('https://getcourse.ru/oferta', 'Оферта') === null, 'оферта самой платформы GetCourse - не документ школы');
    if (failed === before) console.log('  ✓');
  }

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  for (const [name, exp] of Object.entries(CASES)) {
    const before = failed;
    const r = await scanSite(browser, `${base}/${name}/`, { pages: 2 });
    const ids = r.findings.map((f) => f.id);
    console.log(`${name}: ${ids.join(', ') || '(замечаний нет)'}`);
    check(r.ok, `${name}: страница не открылась (${r.error})`);
    for (const id of exp.has) check(ids.includes(id), `${name}: нет ожидаемого замечания ${id}`);
    for (const id of exp.not) check(!ids.includes(id), `${name}: лишнее замечание ${id}`);
    if (exp.platform) check(r.platform === exp.platform, `${name}: платформа ${r.platform}, ожидалась ${exp.platform}`);
    for (const [id, sev] of Object.entries(exp.severity || {})) {
      const f = r.findings.find((x) => x.id === id);
      check(f && f.severity === sev, `${name}: у ${id} уровень ${f && f.severity}, ожидался ${sev}`);
    }
    if (failed === before) console.log('  ✓');
  }
  // Адрес, который ведёт на страницу входа (так бывает у школ на GetCourse): отчёт по нему не строим.
  console.log('страница входа:');
  {
    const before = failed;
    const r = await scanSite(browser, `${base}/login/cms/system/login/`, { pages: 0 });
    check(!r.ok && /страница входа/.test(r.error || ''), `страница входа должна давать понятную ошибку, а получилось: ok=${r.ok}, ${r.error}`);
    if (failed === before) console.log('  ✓');
  }

  // Сохранение по ходу работы, продолжение после сбоя и пересборка отчётов с другими настройками.
  console.log('сохранение и пересборка:');
  {
    const before = failed;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fz152-test-'));
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'));
    const a = await scanSite(browser, `${base}/bad/`, { pages: 0 });
    const b = await scanSite(browser, `${base}/good/`, { pages: 0 });
    // Имитация сбоя: в папке только незавершённый файл, причём последняя строка оборвана.
    fs.writeFileSync(path.join(dir, 'partial.jsonl'), JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n{"input":"http://обрыв');
    const prev = loadPrevious(dir);
    check(prev.size === 2, `после сбоя должно восстановиться 2 сайта, восстановилось ${prev.size}`);
    writeOutputs([...prev.values()], cfg, dir);
    for (const f of ['index.html', 'leads.csv', 'results.json']) check(fs.existsSync(path.join(dir, f)), `нет файла ${f}`);
    check(!fs.existsSync(path.join(dir, 'partial.jsonl')), 'незавершённый файл не удалён после сборки');
    check(fs.readdirSync(path.join(dir, 'reports')).length === 2, 'должно быть 2 отчёта');
    check(fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes('Что встречается чаще всего'), 'в сводке нет блока с частыми проблемами');
    // Пересборка с новым названием сервиса: проверять сайты заново не нужно.
    writeOutputs([...loadPrevious(dir).values()], { ...cfg, brand: 'Тест-бренд' }, dir);
    const report = fs.readFileSync(path.join(dir, 'reports', fs.readdirSync(path.join(dir, 'reports'))[0]), 'utf8');
    check(report.includes('Тест-бренд'), 'после пересборки в отчёте нет нового названия сервиса');
    // Старый домен переадресует на сайт, который уже есть в списке: второй отчёт не нужен.
    const dup = { ...a, input: 'http://old-domain.example/' };
    writeOutputs([a, b, dup], cfg, dir);
    check(fs.readdirSync(path.join(dir, 'reports')).length === 2, 'для адреса-дубля не должно быть отдельного отчёта');
    check(fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes('тот же сайт'), 'в сводке нет пометки про адрес-дубль');
    fs.rmSync(dir, { recursive: true, force: true });
    if (failed === before) console.log('  ✓');
  }

  await browser.close();
  server.close();
  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки пройдены.');
  process.exit(failed ? 1 : 0);
})();
