/* Các hàm thuần dùng ở trình duyệt và trong bộ test Node. */
(function (root) {
  'use strict';
  const normalizeText = value => String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\u200B-\u200D\uFEFF\u2060]/g, '').normalize('NFC');
  const isJson = value => { try { JSON.parse(value); return true; } catch (_) { return false; } };
  function cleanPrompt(raw) {
    let text = normalizeText(raw);
    if (isJson(text.trim())) return text.trim();
    const held = [];
    const shield = value => `\uE000${held.push(value) - 1}\uE001`;
    text = text.replace(/```[^\n]*\n[\s\S]*?```|```[^`]*```|`[^`\n]*`/g, shield);
    text = text.replace(/\\([#\-_*>\[\]()!|~+])/g, '$1');
    text = text.replace(/^(\s*)[+*](?=\s)/gm, '$1-');
    text = text.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => a || b);
    text = text.replace(/(^|[^\p{L}\p{N}*])\*([^*\n]+?)\*(?![\p{L}\p{N}])/gu, '$1$2');
    text = text.replace(/^[\t ]*\*\*[\t ]*|[\t ]*\*\*[\t ]*$/gm, '');
    text = text.split('\n').map(line => line.replace(/[\t ]+$/g, '')).join('\n').replace(/\n(?:[\t ]*\n){2,}/g, '\n\n');
    if (/^"[\s\S]*"$/.test(text.trim())) text = text.trim().slice(1, -1);
    text = text.replace(/"{2,4}/g, '"');
    text = text.trim();
    return text.replace(/\uE000(\d+)\uE001/g, (_, i) => held[Number(i)]);
  }
  function searchNormalize(value) {
    return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
  }
  function extractVars(value) {
    const text = normalizeText(value);
    if (isJson(text.trim())) return [];
    const found = new Map();
    const add = (label, start, end) => {
      const display = label.trim().replace(/\s+/g, ' ').normalize('NFC');
      if (!display || /^\d+$/.test(display) || display.length > 60 || /[",:=;{}]/.test(display)) return;
      const key = display.toLocaleLowerCase('vi').normalize('NFC');
      if (!found.has(key)) found.set(key, { key, label: display, start, end, matches: [{ start, end, raw: text.slice(start, end) }] });
      else found.get(key).matches.push({ start, end, raw: text.slice(start, end) });
    };
    const curly = /\{\{([^{}\n]{1,60})\}\}|\{([^{}\n]{1,60})\}/g;
    let m;
    while ((m = curly.exec(text))) {
      const label = m[1] || m[2];
      if (label.length <= 60 && !/[",:=;{}]/.test(label)) add(label, m.index, m.index + m[0].length);
    }
    const bracket = /\[(Dán|Nhập|Chèn)\s+[^\]\n]{1,55}\]/giu;
    while ((m = bracket.exec(text))) add(m[0].slice(1, -1), m.index, m.index + m[0].length);
    return Array.from(found.values()).sort((a, b) => a.start - b.start);
  }
  function fillVars(text, vars, values) {
    let out = text;
    const edits = [];
    for (const variable of vars) {
      const val = values[variable.key] == null ? '' : String(values[variable.key]);
      if (!val.trim()) continue;
      for (const match of variable.matches) edits.push({ start: match.start, end: match.end, value: val });
    }
    edits.sort((a, b) => b.start - a.start);
    for (const edit of edits) out = out.slice(0, edit.start) + edit.value + out.slice(edit.end);
    return out;
  }
  function previewText(value, limit = 220) {
    return cleanPrompt(value).replace(/^\s*#+\s*/gm, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
  }
  const api = { normalizeText, cleanPrompt, isJson, searchNormalize, normalizeSearch: searchNormalize, extractVars, fillVars, previewText };
  root.PromptPure = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
