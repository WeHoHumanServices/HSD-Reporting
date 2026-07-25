'use strict';
/**
 * Pulls real function/const definitions straight out of index.html so the
 * test suite always exercises the actual shipped source, not a hand-copied
 * snapshot that can drift out of sync.
 *
 * Note: index.html currently has some duplicate top-level `function` names
 * (later declaration wins via hoisting). To match real runtime behavior,
 * this extractor always takes the LAST occurrence of a given name.
 */
const fs = require('fs');

const REGEX_PRECEDING = /[([{,;:=&|!?+\-*%^~<>]$/;
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'do', 'else', 'yield']);

function looksLikeRegexStart(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  const ch = src[j];
  if (REGEX_PRECEDING.test(ch)) return true;
  let k = j;
  while (k >= 0 && /[a-zA-Z_$]/.test(src[k])) k--;
  const word = src.slice(k + 1, j + 1);
  return REGEX_KEYWORDS.has(word);
}

// Skips a template literal starting at src[i] === '`', correctly handling
// arbitrarily nested `${ ... }` expressions that may themselves contain
// nested template literals, strings, regexes, etc.
function skipTemplateLiteral(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === '`') return j + 1;
    if (ch === '$' && src[j + 1] === '{') {
      j += 2;
      let depth = 1;
      while (j < src.length && depth > 0) {
        const skip = skipNonCode(src, j);
        if (skip !== -1) { j = skip; continue; }
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}

function skipNonCode(src, i) {
  const ch = src[i];
  if (ch === '"' || ch === "'") {
    const quote = ch;
    let j = i + 1;
    while (j < src.length && src[j] !== quote) {
      if (src[j] === '\\') { j += 2; continue; }
      j++;
    }
    return j + 1;
  }
  if (ch === '`') {
    return skipTemplateLiteral(src, i);
  }
  if (ch === '/' && src[i + 1] === '/') {
    let j = i;
    while (j < src.length && src[j] !== '\n') j++;
    return j;
  }
  if (ch === '/' && src[i + 1] === '*') {
    let j = i + 2;
    while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
    return j + 2;
  }
  if (ch === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && looksLikeRegexStart(src, i)) {
    let j = i + 1;
    let inClass = false;
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '[') { inClass = true; j++; continue; }
      if (src[j] === ']') { inClass = false; j++; continue; }
      if (src[j] === '/' && !inClass) { j++; break; }
      j++;
    }
    while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
    return j;
  }
  return -1;
}

function findMatchingBrace(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const skip = skipNonCode(src, i);
    if (skip !== -1) { i = skip; continue; }
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new Error('unbalanced braces starting at ' + openIdx);
}

function lastMatch(src, re) {
  let m, last = null;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = r.exec(src))) last = m;
  return last;
}

function extractFunction(src, name) {
  const m = lastMatch(src, new RegExp('function\\s+' + name + '\\s*\\('));
  if (!m) throw new Error('function ' + name + ' not found in source');
  let i = m.index + m[0].length - 1; // at '('
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  const braceStart = src.indexOf('{', i);
  const braceEnd = findMatchingBrace(src, braceStart);
  return src.slice(m.index, braceEnd + 1);
}

function extractConst(src, name) {
  const m = lastMatch(src, new RegExp('const\\s+' + name + '\\s*='));
  if (!m) throw new Error('const ' + name + ' not found in source');
  let j = m.index + m[0].length;
  let depth = 0;
  while (j < src.length) {
    const skip = skipNonCode(src, j);
    if (skip !== -1) { j = skip; continue; }
    const ch = src[j];
    if ('([{'.includes(ch)) { depth++; j++; continue; }
    if (')]}'.includes(ch)) { depth--; j++; continue; }
    if (ch === ';' && depth === 0) { j++; break; }
    j++;
  }
  // rewrite `const NAME = ...;` -> `global.NAME = ...;` so it's visible
  // as a bare identifier to functions eval'd afterward (matches how
  // index.html's own top-level consts are visible to its functions).
  const body = src.slice(m.index, j).replace(/^const\s+/, 'global.');
  return body;
}

/**
 * Build a single JS string containing the requested function and const
 * declarations, extracted verbatim from the given index.html.
 */
function buildHarness(indexHtmlPath, functionNames, constNames) {
  const src = fs.readFileSync(indexHtmlPath, 'utf8');
  const parts = [];
  for (const name of constNames) parts.push(extractConst(src, name));
  for (const name of functionNames) parts.push(extractFunction(src, name));
  return parts.join('\n\n');
}

module.exports = { buildHarness, extractFunction, extractConst };
