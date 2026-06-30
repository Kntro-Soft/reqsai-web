#!/usr/bin/env node
/**
 * i18n parity gate (CI). Validates that every translation file under public/i18n
 * is valid JSON and that all locales share the exact same set of keys — so a key
 * added to one language but forgotten in another fails the build instead of
 * silently shipping a raw key to users.
 *
 * Deterministic on purpose: this app builds many keys dynamically (`'nav.' + seg`,
 * route-title keys), which a usage-scanning tool can't follow without per-key
 * markers. A static key-parity check needs no such annotations and reliably catches
 * the common bug — a key added to one locale but not the others. When you add a key,
 * add it to every file under public/i18n.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'public/i18n';

/** Flattens a nested translation object into a set of dot-separated key paths. */
function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out.add(path);
  }
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
if (files.length < 2) {
  console.log(`i18n: only ${files.length} locale file(s) in ${DIR} — nothing to compare.`);
  process.exit(0);
}

const locales = {};
for (const file of files) {
  const lang = file.replace(/\.json$/, '');
  try {
    locales[lang] = flatten(JSON.parse(readFileSync(join(DIR, file), 'utf8')));
  } catch (err) {
    console.error(`✘ ${file}: invalid JSON — ${err.message}`);
    process.exit(1);
  }
}

// Compare every locale against the union of all keys; report gaps per locale.
const allKeys = new Set();
for (const keys of Object.values(locales)) for (const k of keys) allKeys.add(k);

let failed = false;
for (const [lang, keys] of Object.entries(locales)) {
  const missing = [...allKeys].filter((k) => !keys.has(k)).sort();
  if (missing.length) {
    failed = true;
    console.error(`✘ ${lang}.json is missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`    ${k}`);
  }
}

if (failed) {
  console.error('\ni18n key parity check failed. Keep all locale files in sync.');
  process.exit(1);
}

console.log(`✔ i18n: ${Object.keys(locales).length} locales in parity (${allKeys.size} keys each).`);
