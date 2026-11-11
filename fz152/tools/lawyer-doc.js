#!/usr/bin/env node
'use strict';

// Собирает все тексты, которые попадают в отчёты и письма, в один документ для проверки юристом.
// Запуск: npm run lawyer-doc  (результат: docs/texts-for-lawyer.html)
// Документ всегда строится из актуальных текстов сканера, поэтому после правок его достаточно пересобрать.

const fs = require('fs');
const path = require('path');
const { RULES, GROUPS, RKN_NOTE, EXTRA_NOTES } = require('../lib/analyze');
const { DISCLAIMER, SEV_LABEL, summaryText, renderLetter } = require('../lib/report');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Подстановки вида {fields} показываем понятными словами: это место заполняется автоматически.
const VARS = {
  fields: 'поля формы', where: 'на какой странице', services: 'названия сервисов', count: 'число', total: 'всего',
  cookies: 'названия cookie', what: 'какие данные', hint: 'найденная фраза', labels: 'подпись галочки',
  offer: 'найденное предложение', examples: 'найденные фразы', first: 'первая найденная фраза',
  example: 'пример текста', ratio: 'контраст', hosts: 'адреса фотостоков', files: 'имена файлов', fonts: 'названия шрифтов',
  meta: 'фраза про Meta, если найден её пиксель', note: 'пояснение про Tilda или Adobe Fonts, если подходит',
};
const text = (s) => esc(s).replace(/\{(\w+)\}/g, (m, k) => `<span class="var">[${VARS[k] || k}]</span>`);

// Нормы, на которые ссылаются тексты: собираем автоматически, чтобы их было удобно сверить одним списком.
const LAW_RE = /((?:ч\. \d+ )?ст\. [\d.]+(?: и ст\. [\d.]+)?(?:, [\d.]+)? (?:152-ФЗ|КоАП|ГК РФ|закона «[^»]+»))/g;
const laws = new Map();
const noteLaws = (id, s) => {
  for (const m of String(s || '').matchAll(LAW_RE)) {
    const key = m[1].replace(/\s+/g, ' ');
    if (!laws.has(key)) laws.set(key, new Set());
    laws.get(key).add(id);
  }
};

let n = 0;
const sections = GROUPS.map((g) => {
  const items = Object.entries(RULES).filter(([, r]) => r.group === g.id).map(([id, r]) => {
    n++;
    [r.why, r.fix, r.tilda, r.getcourse].forEach((s) => noteLaws(n, s));
    return `
  <article>
    <h3><span class="num">${n}</span>${esc(r.title)} <span class="sev">${SEV_LABEL[r.severity]}</span></h3>
    <p class="lbl">Почему это важно</p><p>${text(r.why)}</p>
    <p class="lbl">Как исправить</p><p>${text(r.fix)}</p>
    ${r.tilda ? `<p class="lbl">Подсказка для Tilda</p><p>${text(r.tilda)}</p>` : ''}
    ${r.getcourse ? `<p class="lbl">Подсказка для GetCourse</p><p>${text(r.getcourse)}</p>` : ''}
    <p class="lbl">Строка в письме</p><p>${text(r.short)}</p>
    <p class="lbl">Замечания юриста</p><div class="box"></div>
  </article>`;
  });
  return `<h2>${esc(g.title)}</h2>${items.join('')}`;
});

noteLaws('пункт про Роскомнадзор', RKN_NOTE);
Object.values(EXTRA_NOTES).forEach((s) => noteLaws('дополнительные фразы', s));
const lawRows = [...laws].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
  .map(([law, ids]) => `<tr><td>${esc(law)}</td><td>${[...ids].join(', ')}</td><td></td></tr>`).join('');

// Пример письма: собираем его тем же кодом, что и настоящие письма.
const sampleLetter = renderLetter({
  site: 'example-school.ru',
  emails: { generic: ['info@example-school.ru'], other: [] },
  findings: ['no_policy', 'no_consent', 'no_consent_doc'].map((id) => ({
    severity: RULES[id].severity,
    short: RULES[id].short.replace('{fields}', 'имя, телефон').replace('{where}', 'на главной странице'),
  })),
}, {
  brand: '[название сервиса]', contactName: '[имя]', phone: '[телефон]', website: '[сайт]',
  turnaround: '48 часов', prices: { turnkey: '[цена]' },
}, 'example-school.ru.html');

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Тексты отчётов для проверки юристом</title>
<style>
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0C141C;background:#fff}
.w{max-width:860px;margin:0 auto;padding:32px 20px 60px}
h1{font-size:28px;line-height:1.25;margin:0 0 10px}
h2{font-size:21px;margin:40px 0 8px;padding-bottom:6px;border-bottom:3px solid #0071a8}
h3{font-size:17px;margin:0 0 6px}
p{margin:0 0 8px}
.intro{background:#f1f6fa;border-left:4px solid #0071a8;border-radius:8px;padding:14px 18px;margin:16px 0}
.intro ol{margin:8px 0 0;padding-left:22px}
article{border:1px solid #d4dee8;border-radius:12px;padding:16px 18px;margin:14px 0;break-inside:avoid}
.num{display:inline-block;min-width:28px;color:#0071a8;font-weight:800}
.sev{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#3d4a57;border:1px solid #d4dee8;border-radius:999px;padding:1px 8px;margin-left:6px;white-space:nowrap}
.lbl{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#3d4a57;margin:10px 0 2px}
.var{background:#fff3c4;border-radius:4px;padding:0 3px;font-size:14px}
.box{border:1px dashed #9fb3c4;border-radius:8px;min-height:44px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #d4dee8;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f1f6fa;font-size:13px}
pre{background:#f1f6fa;border-radius:8px;padding:14px 16px;white-space:pre-wrap;font:14px/1.55 ui-monospace,Menlo,Consolas,monospace}
</style></head>
<body><main class="w">
<h1>Тексты отчётов для проверки юристом</h1>
<p>Сервис автоматически проверяет сайты малого бизнеса и отправляет владельцу отчёт: что нашли, почему это важно и как исправить.
Ниже все тексты, которые могут попасть в такой отчёт и в сопроводительное письмо. Всего замечаний: ${n}.</p>
<div class="intro"><strong>Что просим проверить</strong>
<ol>
  <li>Верны ли ссылки на нормы и суммы штрафов (сводный список норм в конце документа).</li>
  <li>Нет ли утверждений, которые слишком категоричны или могут ввести владельца сайта в заблуждение.</li>
  <li>Корректны ли советы «Как исправить» и не упущено ли что-то важное.</li>
  <li>Достаточна ли оговорка внизу отчёта и нет ли рисков в тексте письма.</li>
</ol>
<p style="margin-top:8px">Места в квадратных скобках на жёлтом фоне, например <span class="var">[поля формы]</span>, заполняются автоматически данными конкретного сайта.
Отчёт показывает замечание, только если сканер нашёл его признаки на сайте.</p></div>

${sections.join('\n')}

<h2>Прочие тексты</h2>
<article>
  <h3>Итог в начале отчёта</h3>
  <p class="lbl">Если есть серьёзные замечания</p><p>${esc(summaryText({ high: 1 }))}</p>
  <p class="lbl">Если есть только важные</p><p>${esc(summaryText({ medium: 1 }))}</p>
  <p class="lbl">Если только мелкие</p><p>${esc(summaryText({ low: 1 }))}</p>
  <p class="lbl">Замечания юриста</p><div class="box"></div>
</article>
<article>
  <h3>Пункт чек-листа про уведомление в Роскомнадзор</h3>
  <p>Проверьте по ИНН компании${esc(RKN_NOTE)}</p>
  <p class="lbl">Замечания юриста</p><div class="box"></div>
</article>
<article>
  <h3>Фразы, которые добавляются только при определённых находках</h3>
  <p class="lbl">Если найден пиксель Meta (к замечанию «Подключены зарубежные сервисы»)</p><p>${esc(EXTRA_NOTES.meta)}</p>
  <p class="lbl">Если в политике уже упомянута трансграничная передача</p><p>${esc(EXTRA_NOTES.crossBorderDescribed)}</p>
  <p class="lbl">Если сайт на Tilda (к замечанию про шрифты)</p><p>${esc(EXTRA_NOTES.fontsTilda)}</p>
  <p class="lbl">Если шрифты подключены через Adobe Fonts</p><p>${esc(EXTRA_NOTES.fontsAdobe)}</p>
  <p class="lbl">Если на сайте есть отзывы (пункт чек-листа «Отзывы настоящие»)</p><p>${esc(EXTRA_NOTES.reviewsManual)}</p>
  <p class="lbl">Замечания юриста</p><div class="box"></div>
</article>
<article>
  <h3>Оговорка внизу каждого отчёта</h3>
  <p>${esc(DISCLAIMER)}</p>
  <p class="lbl">Замечания юриста</p><div class="box"></div>
</article>
<article>
  <h3>Сопроводительное письмо (пример)</h3>
  <pre>${esc(sampleLetter)}</pre>
  <p>Письма отправляются вручную, только на общие адреса компаний, с конкретными находками по сайту получателя и не более одного повторного письма.</p>
  <p class="lbl">Замечания юриста</p><div class="box"></div>
</article>

<h2>Нормы, на которые ссылаются тексты</h2>
<table><thead><tr><th>Норма</th><th>В каких замечаниях</th><th>Верно? Комментарий</th></tr></thead><tbody>${lawRows}</tbody></table>
</main></body></html>
`;

const out = path.join(__dirname, '..', 'docs', 'texts-for-lawyer.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Готово: ${out} (замечаний: ${n}, норм: ${laws.size})`);
