'use strict';

const { GROUPS } = require('./analyze');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function plural(n, forms) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

const ZAMECH = ['замечание', 'замечания', 'замечаний'];
const SEV_LABEL = { high: 'Серьёзно', medium: 'Важно', low: 'Можно позже' };
const STATUS = {
  ok: { icon: '✓', label: 'в порядке' },
  fail: { icon: '✕', label: 'нужно исправить' },
  warn: { icon: '!', label: 'стоит проверить' },
  na: { icon: '-', label: 'не нужно' },
  manual: { icon: '?', label: 'проверьте сами' },
};

// Оговорка внизу каждого отчёта.
const DISCLAIMER = 'Проверка сделана автоматически по тому, что видно на страницах сайта. Это не юридическое заключение: '
  + 'внутренние документы, защиту данных и уведомление в Роскомнадзор по сайту не увидеть, их нужно проверять отдельно.';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function summaryText(c) {
  if (c.high) return 'Есть серьёзные нарушения, за которые штрафуют. Их лучше исправить в первую очередь, обычно на это уходит день-два.';
  if (c.medium) return 'Грубых нарушений нет, но есть вещи, которые не соответствуют правилам 2025 года или могут вызвать вопросы.';
  if (c.low) return 'В целом всё неплохо, есть несколько небольших рекомендаций.';
  return 'По открытым признакам нарушений не нашли. Отличная работа!';
}

// Палитра ESPORT: «Турнирный синий» #0C141C и «Электрик лазурь» #00B4FF.
// Все сочетания текста и фона - с контрастом не ниже 4,5:1, при печати включается светлая версия.
const CSS = `
:root{--bg:#0C141C;--card:#121E2A;--card2:#16263A;--line:#1F3346;--fg:#E8F1F8;--muted:#9FB3C4;--acc:#00B4FF;--ink:#0C141C;
--high:#FF6B6B;--medium:#FFC800;--low:#8FA3B5;--ok:#3DDC97}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--fg);background:var(--bg)}
a{color:var(--acc)}
.w{max-width:880px;margin:0 auto;padding:36px 20px 56px}
.brand{display:inline-block;font-weight:800;letter-spacing:.6px;text-transform:uppercase;font-size:13px;color:var(--acc);margin-bottom:12px}
h1{font-size:28px;line-height:1.25;margin:0 0 8px;font-weight:800}
h1 span{color:var(--acc)}
h2{font-size:21px;margin:38px 0 14px;font-weight:800}
h3{font-size:15px;margin:26px 0 4px;color:var(--acc);text-transform:uppercase;letter-spacing:.5px}
.meta{color:var(--muted);margin:0;font-size:14px}
.lead{color:var(--muted);margin:10px 0 0}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-top:16px}
.summary{display:flex;gap:18px;align-items:center;border-left:6px solid var(--ok)}
.summary.high{border-left-color:var(--high)}.summary.medium{border-left-color:var(--medium)}.summary.low{border-left-color:var(--low)}
.summary .big{font-size:46px;font-weight:800;min-width:60px;text-align:center;color:var(--acc)}
.summary p{margin:4px 0 0;color:var(--muted)}
table.check{width:100%;border-collapse:collapse}
.check td{padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}
.check tr.grp td{padding-top:18px;border-bottom:0;color:var(--acc);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.5px}
.check tr.grp:first-child td{padding-top:4px}
.ic{display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--ink)}
.ic.ok{background:var(--ok)}.ic.fail{background:var(--high)}.ic.warn{background:var(--medium)}.ic.na{background:var(--low)}.ic.manual{background:var(--acc)}
.check .st{color:var(--muted);font-size:13px;white-space:nowrap;text-align:right}
.check .note{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.card{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--low);border-radius:16px;padding:18px 22px;margin-top:12px}
.card.high{border-left-color:var(--high)}.card.medium{border-left-color:var(--medium)}
.card h4{margin:6px 0 10px;font-size:18px}
.badge{display:inline-block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--low)}
.card.high .badge{color:var(--high)}.card.medium .badge{color:var(--medium)}
.card b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-top:12px}
.card p,.card ul{margin:4px 0 0}.card ul{padding-left:20px}
.card li{word-break:break-word}
.tip{background:var(--card2);border-left:3px solid var(--acc);border-radius:8px;padding:8px 12px;margin-top:10px!important}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}
.chip{background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:14px}
.cta{border:2px solid var(--acc)}
.cta ol{padding-left:20px;margin:0}.cta li{margin:8px 0}
.contacts{margin:16px 0 0;font-weight:700}
footer{color:var(--muted);font-size:13px;margin-top:24px}
@media print{
  :root{--bg:#fff;--card:#fff;--card2:#f1f6fa;--line:#d4dee8;--fg:#0C141C;--muted:#3d4a57;--acc:#0071a8;--ink:#fff;
  --high:#b42318;--medium:#8a5a00;--low:#4f5b66;--ok:#1e7a46}
  section,.card{break-inside:avoid}
}
`;

function renderChecklist(r) {
  const rows = [];
  for (const g of GROUPS) {
    const items = r.checklist.filter((c) => c.group === g.id);
    if (!items.length) continue;
    rows.push(`<tr class="grp"><td colspan="3">${esc(g.title)}</td></tr>`);
    for (const c of items) {
      rows.push(`<tr><td style="width:34px"><span class="ic ${c.status}" aria-hidden="true">${STATUS[c.status].icon}</span></td>
      <td>${esc(c.item)}${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</td>
      <td class="st">${STATUS[c.status].label}</td></tr>`);
    }
  }
  return `<table class="check">${rows.join('')}</table>`;
}

function renderFindings(r) {
  const out = [];
  for (const g of GROUPS) {
    const items = r.findings.filter((f) => f.group === g.id);
    if (!items.length) continue;
    out.push(`<h3>${esc(g.title)}</h3>`);
    for (const f of items) {
      out.push(`
    <article class="card ${f.severity}">
      <span class="badge">${SEV_LABEL[f.severity]}</span>
      <h4>${esc(f.title)}</h4>
      <b>Что нашли</b><ul>${f.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <b>Почему это важно</b><p>${esc(f.why)}</p>
      <b>Как исправить</b><p>${esc(f.fix)}</p>${f.tip ? `<p class="tip">${esc(f.tip)}</p>` : ''}
    </article>`);
    }
  }
  return out.join('');
}

function renderInventory(r) {
  const inv = r.inventory || { ru: [], foreign: [], other: [] };
  if (!inv.ru.length && !inv.foreign.length && !inv.other.length) return '';
  const chips = (list) => `<div class="chips">${list.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;
  return `<h2>Какие сторонние сервисы работают на сайте</h2>
<section>
  <p class="lead" style="margin-top:0">Каждый из них получает данные посетителей, поэтому всех их стоит перечислить в политике.</p>
  ${inv.ru.length ? `<b>Российские</b>${chips(inv.ru)}` : ''}
  ${inv.foreign.length ? `<b>Зарубежные</b>${chips(inv.foreign)}` : ''}
  ${inv.other.length ? `<b>Другие домены</b>${chips(inv.other)}` : ''}
</section>`;
}

function renderReport(r, cfg) {
  const total = r.findings.length;
  const level = r.counts.high ? 'high' : r.counts.medium ? 'medium' : r.counts.low ? 'low' : 'ok';
  const p = cfg.prices || {};
  const info = r.info.length
    ? `<h2>Что ещё учесть</h2><section><ul>${r.info.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Проверка сайта ${esc(r.site)}</title>
<style>${CSS}</style></head>
<body><main class="w">
<header>
  <div class="brand">${esc(cfg.brand)}</div>
  <h1>Проверка сайта <span>${esc(r.site)}</span></h1>
  <p class="meta">${fmtDate(r.scannedAt)} · Просмотрено страниц: ${r.pagesScanned.length}${r.platform ? ' · Платформа: ' + esc(r.platform) : ''}</p>
  <p class="lead">Проверили сайт по 20 пунктам: персональные данные, cookie, оферта и возврат денег, реклама и отзывы, удобство для всех и лицензии.</p>
</header>

<section class="summary ${level}">
  <div class="big">${total}</div>
  <div><strong>${total ? `${total} ${plural(total, ZAMECH)}: серьёзных ${r.counts.high}, важных ${r.counts.medium}, можно отложить ${r.counts.low}` : 'Замечаний нет'}</strong>
  <p>${esc(summaryText(r.counts))}</p></div>
</section>

<h2>Чек-лист</h2>
<section>${renderChecklist(r)}</section>

${total ? `<h2>Что нашли и как исправить</h2>${renderFindings(r)}` : ''}
${renderInventory(r)}
${info}

<h2>Как всё исправить</h2>
<section class="cta"><ol>
  <li><strong>Сами</strong>, по инструкциям выше. Это бесплатно.</li>
  <li><strong>Документы под ваш сайт - ${esc(p.package)}</strong>: политика, согласие, оферта и правила возврата, текст для баннера cookie, черновик уведомления в Роскомнадзор и пошаговая инструкция.</li>
  <li><strong>Под ключ - ${esc(p.turnkey)}</strong>: всё то же самое, плюс мы сами всё внедрим. Срок - ${esc(cfg.turnaround)}.</li>
  <li><strong>Сопровождение - ${esc(p.monitoring)}</strong>: регулярно перепроверяем сайт и обновляем документы, когда меняются законы.</li>
</ol>
<p class="contacts">${[cfg.contactName, cfg.brand, cfg.phone, cfg.email, cfg.website].filter(Boolean).map(esc).join(' · ')}</p>
</section>

<footer>${esc(DISCLAIMER)}</footer>
</main></body></html>`;
}

function renderLetter(r, cfg, reportFileName) {
  if (!r.findings.some((f) => f.severity !== 'low')) return null;
  const top = r.findings.slice(0, 3);
  const n = r.findings.length;
  const p = cfg.prices || {};
  const to = r.emails.generic[0] || r.emails.other[0];
  return [
    `Кому: ${to || 'e-mail не нашли, напишите через форму или чат на сайте'}`,
    `Тема: ${r.site}: ${n} ${plural(n, ZAMECH)} после бесплатной проверки сайта`,
    `Вложение: ${reportFileName}`,
    '',
    'Здравствуйте!',
    '',
    `Меня зовут ${cfg.contactName}, я из ${cfg.brand}. Мы бесплатно проверили ваш сайт ${r.site} по 20 пунктам: персональные данные, cookie, оферта и возврат, реклама, удобство для всех и лицензии.`,
    '',
    'Вот что стоит поправить в первую очередь:',
    '',
    ...top.map((f) => `- ${f.short}`),
    '',
    'Во вложении подробный отчёт: по каждому пункту там написано, почему это важно и как исправить. Многое можно сделать самим, без нас.',
    '',
    `Если не хочется тратить на это время, можем сделать всё под ключ за ${cfg.turnaround}. Стоимость - ${p.turnkey}.`,
    '',
    'Хорошего дня!',
    cfg.contactName,
    cfg.brand,
    [cfg.phone, cfg.website].filter(Boolean).join(' · '),
    '',
    'P.S. Если письмо не по адресу, просто ответьте «нет», и мы больше не напишем.',
    '',
  ].join('\n');
}

function renderIndex(results, cfg, files) {
  const rows = results.map((r) => {
    const f = files[r.site] || {};
    if (!r.ok) {
      return `<tr class="err"><td><a href="${esc(r.startUrl)}">${esc(r.site)}</a></td><td colspan="5">Не получилось проверить: ${esc(r.error)}</td></tr>`;
    }
    return `<tr>
      <td><a href="${esc(r.finalUrl)}">${esc(r.site)}</a>${r.platform ? `<div class="m">${esc(r.platform)}</div>` : ''}</td>
      <td class="n">${r.score}</td>
      <td class="n"><span class="h">${r.counts.high}</span> / <span class="md">${r.counts.medium}</span> / ${r.counts.low}</td>
      <td>${r.findings.slice(0, 3).map((x) => esc(x.title)).join('<br>') || '-'}</td>
      <td>${esc(r.emails.generic.slice(0, 2).join(', ') || r.emails.other.slice(0, 1).join(', ') || '-')}</td>
      <td>${f.report ? `<a href="${esc(f.report)}">отчёт</a>` : ''}${f.letter ? ` · <a href="${esc(f.letter)}">письмо</a>` : ''}</td>
    </tr>`;
  }).join('');
  const okCount = results.filter((r) => r.ok).length;
  const hot = results.filter((r) => r.ok && r.counts.high).length;
  // Что встречается чаще всего: помогает понять, о чём писать в первую очередь.
  const freq = new Map();
  for (const r of results) for (const f of (r.ok ? r.findings : [])) freq.set(f.title, (freq.get(f.title) || 0) + 1);
  const top = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topBlock = okCount && top.length ? `<h2>Что встречается чаще всего</h2>
<section><div class="chips" style="margin:0">${top.map(([title, n]) =>
    `<span class="chip">${esc(title)}: <b>${n}</b> из ${okCount} (${Math.round(n / okCount * 100)}%)</span>`).join('')}</div></section>` : '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Результаты проверки сайтов</title>
<style>${CSS}
.w{max-width:1200px}table.t{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;font-size:14px}
.t th,.t td{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.t th{background:var(--card2);font-size:13px;color:var(--muted)}
.t .n{text-align:center;font-weight:800}.t .h{color:var(--high)}.t .md{color:var(--medium)}.t .m{color:var(--muted);font-size:12px}.t tr.err td{color:var(--muted)}
</style></head><body><main class="w">
<div class="brand">${esc(cfg.brand)}</div>
<h1>Результаты проверки сайтов</h1>
<p class="meta">Проверено сайтов: ${okCount} из ${results.length} · С серьёзными нарушениями: ${hot} · Сверху сайты с наибольшим числом замечаний (серьёзное = 3 балла, важное = 2, можно позже = 1)</p>
${topBlock}
<h2>Сайты</h2>
<table class="t"><thead><tr><th>Сайт</th><th>Баллы</th><th>Серьёзных / важных / можно позже</th><th>Главное</th><th>E-mail для связи</th><th>Файлы</th></tr></thead>
<tbody>${rows}</tbody></table>
</main></body></html>`;
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// CSV с разделителем «;» и BOM: так Excel в русской версии открывает его без кракозябр.
function renderCsv(results, files) {
  const head = ['Сайт', 'Статус', 'Платформа', 'Баллы', 'Серьёзные', 'Важные', 'Можно позже', 'Главные проблемы',
    'ИНН', 'ОГРН', 'E-mail (общие)', 'E-mail (прочие)', 'Отчёт', 'Письмо', 'Ошибка'];
  const lines = [head.map(csvCell).join(';')];
  for (const r of results) {
    const f = files[r.site] || {};
    lines.push([
      r.site, r.ok ? 'проверен' : 'ошибка', r.platform || '', r.score, r.counts.high, r.counts.medium, r.counts.low,
      r.findings.map((x) => x.title).join(' | '), r.requisites.inn.join(', '), r.requisites.ogrn.join(', '),
      r.emails.generic.join(', '), r.emails.other.join(', '), f.report || '', f.letter || '', r.error || '',
    ].map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { renderReport, renderLetter, renderIndex, renderCsv, plural, summaryText, CSS, DISCLAIMER, SEV_LABEL };
