'use strict';

// Контрольные суммы ИНН и ОГРН: отсекают телефоны и случайные числа.

function innValid(s) {
  if (!/^(\d{10}|\d{12})$/.test(s)) return false;
  const d = s.split('').map(Number);
  const sum = (coefs) => coefs.reduce((acc, c, i) => acc + c * d[i], 0);
  if (d.length === 10) return (sum([2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10 === d[9];
  const n11 = (sum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
  const n12 = (sum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
  return n11 === d[10] && n12 === d[11];
}

function ogrnValid(s) {
  if (/^\d{13}$/.test(s)) return Number((BigInt(s.slice(0, 12)) % 11n) % 10n) === Number(s[12]);
  if (/^\d{15}$/.test(s)) return Number((BigInt(s.slice(0, 14)) % 13n) % 10n) === Number(s[14]);
  return false;
}

// Принимает строки вида «ИНН 7700000016», «ОГРН 1027700000019» или произвольный текст.
function extractRequisites(input) {
  const text = Array.isArray(input) ? input.join(' \n ') : String(input || '');
  const inn = new Set();
  const ogrn = new Set();
  for (const m of text.matchAll(/ИНН(?:\s*\/\s*КПП)?\s*[:№]?\s*(\d{10,12})(?!\d)/gi)) {
    if (innValid(m[1])) inn.add(m[1]);
  }
  for (const m of text.matchAll(/ОГРН(?:ИП)?\s*[:№]?\s*(\d{13,15})(?!\d)/gi)) {
    if (ogrnValid(m[1])) ogrn.add(m[1]);
  }
  return { inn: [...inn], ogrn: [...ogrn] };
}

module.exports = { innValid, ogrnValid, extractRequisites };
