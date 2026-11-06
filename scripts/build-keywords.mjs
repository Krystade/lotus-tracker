// Builds src/data/rules-glossary.json from the Comprehensive Rules text.
//
//   node scripts/build-keywords.mjs [path-to-MagicCompRules.txt]
//
// Get the current text from https://magic.wizards.com/en/rules ("TXT").
// Keyword abilities (702), keyword actions (701) and the glossary are taken
// verbatim, so what the app shows is the official wording, not a paraphrase.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const src = process.argv[2] || "data/MagicCompRules.txt";
const raw = readFileSync(src, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
const lines = raw.split("\n");

const effective = (raw.match(/These rules are effective as of ([^.]+)\./) || [])[1] || "";

// The table of contents repeats every heading; the rules proper start at the
// second "1. Game Concepts", and the glossary at the second "Glossary".
const nth = (re, n) => {
  let seen = 0;
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i]) && ++seen === n) return i;
  return -1;
};
const rulesStart = nth(/^1\. Game Concepts$/, 2);
const glossaryStart = nth(/^Glossary$/, 2);
const creditsStart = nth(/^Credits$/, 2);
if (rulesStart < 0 || glossaryStart < 0 || creditsStart < 0) throw new Error("unexpected rules layout");

// --- 701 / 702: "702.2. Deathtouch" then "702.2a ..." lines until the next heading.
const entries = [];
let cur = null;
for (let i = rulesStart; i < glossaryStart; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const head = line.match(/^(70[12])\.(\d+)\. (.+)$/);
  if (head) {
    if (head[2] === "1") { cur = null; continue; } // "702.1. General"
    cur = { name: head[3], kind: head[1] === "702" ? "ability" : "action", rule: `${head[1]}.${head[2]}`, rules: [] };
    entries.push(cur);
    continue;
  }
  if (/^\d{3}\.\d+\. /.test(line) || /^\d{3}\. /.test(line) || /^\d\. /.test(line)) { cur = null; continue; }
  if (!cur) continue;
  const sub = line.match(/^(70[12]\.\d+[a-z]+) (.+)$/);
  if (sub) cur.rules.push({ id: sub[1], text: sub[2] });
  else if (/^Example: /.test(line) && cur.rules.length) {
    const last = cur.rules[cur.rules.length - 1];
    (last.examples ??= []).push(line.replace(/^Example: /, ""));
  }
}

// --- Glossary: a term line, then its definition lines, then a blank line.
const glossary = new Map();
for (let i = glossaryStart + 1; i < creditsStart; i++) {
  const term = lines[i].trim();
  if (!term) continue;
  const def = [];
  while (i + 1 < creditsStart && lines[i + 1].trim()) def.push(lines[++i].trim());
  if (def.length) glossary.set(term, def.join(" "));
}

const norm = (s) => s.toLowerCase().replace(/[“”"]/g, "").trim();
const glossaryByName = new Map([...glossary].map(([k, v]) => [norm(k), v]));

const keywords = entries.map((e) => ({ ...e, summary: glossaryByName.get(norm(e.name)) ?? "" }));
const keywordNames = new Set(keywords.map((k) => norm(k.name)));
const terms = [...glossary]
  .filter(([term]) => !keywordNames.has(norm(term)))
  .map(([name, summary]) => ({ name, summary }));

mkdirSync("src/data", { recursive: true });
const out = { effective, keywords, terms };
writeFileSync("src/data/rules-glossary.json", JSON.stringify(out));
console.log(`effective ${effective}: ${keywords.length} keywords, ${terms.length} other terms, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
