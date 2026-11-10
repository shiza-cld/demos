'use strict';

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
const SEV_LABEL = { high: 'Серьёзно', medium: 'Средне', low: 'Незначительно' };
const STATUS = {
  ok: { icon: '✓', label: 'в порядке' },
  fail: { icon: '✕', label: 'нарушение' },
  warn: { icon: '!', label: 'есть замечания' },
  na: { icon: '—', label: 'не применимо' },
  manual: { icon: '?', label: 'проверить вручную' },
};

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function summaryText(c) {
  if (c.high) return 'Есть нарушения, за которые Роскомнадзор назначает штрафы. Их стоит исправить в первую очередь — обычно это занимает один-два дня.';
  if (c.medium) return 'Грубых нарушений не найдено, но есть моменты, которые не соответствуют требованиям, действующим с 2025 года.';
  if (c.low) return 'Сайт в целом в порядке, есть несколько небольших рекомендаций.';
  return 'Явных нарушений по открытым признакам не найдено.';
}

const CSS = `
:root{--fg:#1d2433;--muted:#5b6475;--line:#e3e7ee;--bg:#f6f8fb;--high:#c0392b;--medium:#c27c0e;--low:#6b7280;--ok:#1e8449;--acc:#2f54eb}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--fg);background:var(--bg)}
.w{max-width:860px;margin:0 auto;padding:32px 20px 48px}
header .brand{font-weight:700;color:var(--acc);letter-spacing:.3px;margin-bottom:10px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px}h1 span{color:var(--acc)}
h2{font-size:20px;margin:34px 0 14px}
.meta{color:var(--muted);margin:0;font-size:14px}
section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-top:18px}
section.plain{background:none;border:0;padding:0}
.summary{display:flex;gap:18px;align-items:center;border-left:6px solid var(--ok)}
.summary.high{border-left-color:var(--high)}.summary.medium{border-left-color:var(--medium)}.summary.low{border-left-color:var(--low)}
.summary .big{font-size:44px;font-weight:800;min-width:56px;text-align:center}
.summary p{margin:4px 0 0;color:var(--muted)}
table.check{width:100%;border-collapse:collapse}
.check td{padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}
.check tr:last-child td{border-bottom:0}
.ic{display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff}
.ic.ok{background:var(--ok)}.ic.fail{background:var(--high)}.ic.warn{background:var(--medium)}.ic.na{background:#c4c9d2}.ic.manual{background:var(--acc)}
.check .st{color:var(--muted);font-size:13px;white-space:nowrap;text-align:right}
.check .note{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.card{background:#fff;border:1px solid var(--line);border-left:6px solid var(--low);border-radius:14px;padding:18px 22px;margin-top:14px}
.card.high{border-left-color:var(--high)}.card.medium{border-left-color:var(--medium)}
.card h3{margin:6px 0 10px;font-size:18px}
.badge{display:inline-block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--low)}
.card.high .badge{color:var(--high)}.card.medium .badge{color:var(--medium)}
.card b{display:block;font-size:13px;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);margin-top:10px}
.card p,.card ul{margin:4px 0 0}.card ul{padding-left:20px}
.card li{word-break:break-word}
.tilda{background:#f1f5ff;border-radius:8px;padding:8px 12px;margin-top:8px!important}
.cta{border:2px solid var(--acc)}
.cta ol{padding-left:20px;margin:0}.cta li{margin:8px 0}
.contacts{margin:14px 0 0;font-weight:600}
footer{color:var(--muted);font-size:13px;margin-top:22px}
@media print{body{background:#fff}section,.card{break-inside:avoid}}
`;

function renderReport(r, cfg) {
  const total = r.findings.length;
  const level = r.counts.high ? 'high' : r.counts.medium ? 'medium' : r.counts.low ? 'low' : 'ok';
  const p = cfg.prices || {};

  const checklist = r.checklist.map((c) => `
      <tr><td style="width:34px"><span class="ic ${c.status}">${STATUS[c.status].icon}</span></td>
      <td>${esc(c.item)}${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</td>
      <td class="st">${STATUS[c.status].label}</td></tr>`).join('');

  const cards = r.findings.map((f) => `
    <article class="card ${f.severity}">
      <span class="badge">${SEV_LABEL[f.severity]}</span>
      <h3>${esc(f.title)}</h3>
      <b>Что нашли</b><ul>${f.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <b>Почему это важно</b><p>${esc(f.why)}</p>
      <b>Как исправить</b><p>${esc(f.fix)}</p>${f.tip ? `<p class="tilda">${esc(f.tip)}</p>` : ''}
    </article>`).join('');

  const info = r.info.length
    ? `<h2>Что ещё учесть</h2><section><ul>${r.info.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Проверка сайта ${esc(r.site)} по 152-ФЗ</title>
<style>${CSS}</style></head>
<body><main class="w">
<header>
  <div class="brand">${esc(cfg.brand)}</div>
  <h1>Экспресс-проверка сайта <span>${esc(r.site)}</span> по 152-ФЗ «О персональных данных»</h1>
  <p class="meta">Дата проверки: ${fmtDate(r.scannedAt)} · Просмотрено страниц: ${r.pagesScanned.length}${r.platform ? ' · Платформа: ' + esc(r.platform) : ''}</p>
</header>

<section class="summary ${level}">
  <div class="big">${total}</div>
  <div><strong>${total ? `${total} ${plural(total, ZAMECH)}: серьёзных — ${r.counts.high}, средних — ${r.counts.medium}, незначительных — ${r.counts.low}` : 'Замечаний нет'}</strong>
  <p>${esc(summaryText(r.counts))}</p></div>
</section>

<h2>Чек-лист</h2>
<section><table class="check">${checklist}</table></section>

${total ? `<h2>Что нашли и как исправить</h2><div class="plain">${cards}</div>` : ''}
${info}

<h2>Как исправить</h2>
<section class="cta"><ol>
  <li><strong>Самостоятельно</strong> — по инструкциям выше, это бесплатно.</li>
  <li><strong>Пакет документов под ваш сайт — ${esc(p.package)}</strong>: политика, согласие на обработку, текст для плашки о cookie, черновик уведомления в Роскомнадзор и пошаговая инструкция по внедрению.</li>
  <li><strong>Под ключ — ${esc(p.turnkey)}</strong>: всё то же самое, плюс сами внедрим на сайт. Срок — ${esc(cfg.turnaround)}.</li>
  <li><strong>Мониторинг — ${esc(p.monitoring)}</strong>: регулярно перепроверяем сайт и обновляем документы при изменениях закона.</li>
</ol>
<p class="contacts">${[cfg.contactName, cfg.brand, cfg.phone, cfg.email, cfg.website].filter(Boolean).map(esc).join(' · ')}</p>
</section>

<footer>Проверка выполнена автоматически по открытым признакам на страницах сайта и не является юридическим заключением.
Наличие уведомления в Роскомнадзоре, внутренних документов и мер защиты данных по сайту определить нельзя — их нужно проверить отдельно.</footer>
</main></body></html>`;
}

function renderLetter(r, cfg, reportFileName) {
  const important = r.findings.filter((f) => f.severity !== 'low');
  if (!important.length) return null;
  const top = r.findings.slice(0, 3);
  const n = r.findings.length;
  const p = cfg.prices || {};
  const to = r.emails.generic[0] || r.emails.other[0];
  return [
    `Кому: ${to || '— e-mail не найден, напишите через форму или чат на сайте'}`,
    `Тема: ${r.site}: ${n} ${plural(n, ZAMECH)} по закону о персональных данных`,
    `Вложение: ${reportFileName}`,
    '',
    'Здравствуйте!',
    '',
    `Мы бесплатно проверили сайт ${r.site} на соответствие 152-ФЗ «О персональных данных» и нашли несколько моментов, которые стоит поправить:`,
    '',
    ...top.map((f) => `— ${f.short}`),
    '',
    'Подробный отчёт с пояснениями и пошаговой инструкцией — во вложении. По нему всё можно исправить самостоятельно, это бесплатно.',
    '',
    `Если удобнее поручить это нам — подготовим документы под ваш сайт и внедрим их за ${cfg.turnaround}, стоимость — ${p.turnkey}.`,
    '',
    'С уважением,',
    cfg.contactName,
    cfg.brand,
    [cfg.phone, cfg.website].filter(Boolean).join(' · '),
    '',
    'Если письмо не по адресу или неактуально — просто ответьте «нет», и мы больше не напишем.',
    '',
  ].join('\n');
}

function renderIndex(results, cfg, files) {
  const rows = results.map((r) => {
    const f = files[r.site] || {};
    if (!r.ok) {
      return `<tr class="err"><td><a href="${esc(r.startUrl)}">${esc(r.site)}</a></td><td colspan="5">Не удалось проверить: ${esc(r.error)}</td></tr>`;
    }
    return `<tr>
      <td><a href="${esc(r.finalUrl)}">${esc(r.site)}</a>${r.platform ? `<div class="m">${esc(r.platform)}</div>` : ''}</td>
      <td class="n">${r.score}</td>
      <td class="n"><span class="h">${r.counts.high}</span> / <span class="md">${r.counts.medium}</span> / ${r.counts.low}</td>
      <td>${r.findings.slice(0, 3).map((x) => esc(x.title)).join('<br>') || '—'}</td>
      <td>${esc(r.emails.generic.slice(0, 2).join(', ') || r.emails.other.slice(0, 1).join(', ') || '—')}</td>
      <td>${f.report ? `<a href="${esc(f.report)}">отчёт</a>` : ''}${f.letter ? ` · <a href="${esc(f.letter)}">письмо</a>` : ''}</td>
    </tr>`;
  }).join('');
  const okCount = results.filter((r) => r.ok).length;
  const hot = results.filter((r) => r.ok && r.counts.high).length;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Результаты проверки сайтов по 152-ФЗ</title>
<style>${CSS}
.w{max-width:1200px}table.t{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
.t th,.t td{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.t th{background:#eef2f8;font-size:13px}
.t .n{text-align:center;font-weight:700}.t .h{color:var(--high)}.t .md{color:var(--medium)}.t .m{color:var(--muted);font-size:12px}.t tr.err td{color:var(--muted)}
</style></head><body><main class="w">
<h1>Результаты проверки сайтов по 152-ФЗ</h1>
<p class="meta">Проверено сайтов: ${okCount} из ${results.length} · С серьёзными нарушениями: ${hot} · Отсортировано по баллам (серьёзное = 3, среднее = 2, незначительное = 1)</p>
<table class="t"><thead><tr><th>Сайт</th><th>Баллы</th><th>Серьёзн. / средн. / незнач.</th><th>Главные проблемы</th><th>E-mail для связи</th><th>Файлы</th></tr></thead>
<tbody>${rows}</tbody></table>
</main></body></html>`;
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// CSV с разделителем «;» и BOM — так Excel в русской локали открывает его без «кракозябр».
function renderCsv(results, files) {
  const head = ['Сайт', 'Статус', 'Платформа', 'Баллы', 'Серьёзные', 'Средние', 'Незначительные', 'Главные проблемы',
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

module.exports = { renderReport, renderLetter, renderIndex, renderCsv, plural };
