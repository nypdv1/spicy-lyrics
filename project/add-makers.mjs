// Hides a sync's makers in a TTML, as invisible characters after its last sung word, so they
// survive Spicy Lyrics' upload (which keeps one Maker and drops other metadata). The fork reads
// them back out and credits everyone (src/utils/Lyrics/HiddenMakers.ts has the format).
//
// Usage:
//   node project/add-makers.mjs <file.ttml> [discordId ...]
//
// With ids, those are the makers, in that order. Without, the file's own
// <amll:meta key="makers" value="…"/> entries are used. A payload the file already has is
// replaced, so running it again with a new list updates it. The given ids are also written as
// amll:meta "makers" entries, and the original file is kept beside it as <name>.bak.ttml.

import fs from "node:fs";
import path from "node:path";

// Node loads the TypeScript helper fine but warns that the project isn't marked as ESM.
process.emitWarning = () => {};
const { EncodeHiddenMakers } = await import("../src/utils/Lyrics/HiddenMakers.ts");

const [file, ...argIds] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node project/add-makers.mjs <file.ttml> [discordId ...]");
  process.exit(1);
}

const DISCORD_ID = /^\d{15,21}$/;
// Ids can be given separated by spaces or commas.
const givenIds = argIds.flatMap((arg) => arg.split(",")).map((id) => id.trim()).filter(Boolean);
const badIds = givenIds.filter((id) => !DISCORD_ID.test(id));
if (badIds.length > 0) {
  console.error(`Not Discord ids: ${badIds.join(", ")}`);
  process.exit(1);
}

let ttml = fs.readFileSync(file, "utf8");

const metaIds = [...ttml.matchAll(/<amll:meta key="makers" value="(\d+)"\s*\/>/g)].map((m) => m[1]);
const ids = [...new Set(givenIds.length > 0 ? givenIds : metaIds)];
if (ids.length === 0) {
  console.error('No makers: pass Discord ids, or add <amll:meta key="makers" value="…"/> entries to the file.');
  process.exit(1);
}

// Any earlier payload goes first (start mark through end mark, all invisible characters).
const INVISIBLE = "[\\u200b\\u200c\\u200d\\u2060]";
ttml = ttml.replace(new RegExp(`\\u2060\\u2060\\u2060\\u2060(?:${INVISIBLE}{2})*?\\u2060\\u200d`, "g"), "");

// The last word of the lead vocals: the last leaf <span> with text that isn't inside a
// background (x-bg) span. Tags are walked with a stack to know which spans are background.
let target = null;
const stack = [];
const tag = /<(\/?)span\b([^>]*)>|<\/?p\b[^>]*>/g;
for (let m; (m = tag.exec(ttml)); ) {
  if (!m[0].startsWith("<span") && !m[0].startsWith("</span")) {
    stack.length = 0;
    continue;
  }
  if (m[1] === "/") {
    stack.pop();
    continue;
  }
  stack.push(/ttm:role="x-bg"/.test(m[2]));
  const close = ttml.indexOf("</span>", tag.lastIndex);
  const text = ttml.slice(tag.lastIndex, close);
  // A leaf span: its text runs straight to its closing tag.
  if (!text.includes("<") && text.trim() && !stack.includes(true)) target = close;
}
if (target === null) {
  console.error("Couldn't find a sung word to attach the makers to.");
  process.exit(1);
}
const word = ttml.slice(0, target).match(/>([^<>]*)$/)?.[1];
ttml = ttml.slice(0, target) + EncodeHiddenMakers(ids) + ttml.slice(target);

// Keep the readable metadata in step with what's hidden.
if (givenIds.length > 0) {
  ttml = ttml.replace(/<amll:meta key="makers" value="\d+"\s*\/>/g, "");
  const entries = ids.map((id) => `<amll:meta key="makers" value="${id}"/>`).join("");
  if (ttml.includes("</metadata>")) {
    // The readable copy needs the amll namespace on the root element.
    if (!/xmlns:amll=/.test(ttml)) ttml = ttml.replace(/<tt\b/, '<tt xmlns:amll="http://www.example.com/ns/amll"');
    ttml = ttml.replace("</metadata>", `${entries}</metadata>`);
  }
}

const parsed = path.parse(file);
const backup = path.join(parsed.dir, `${parsed.name}.bak${parsed.ext}`);
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
fs.writeFileSync(file, ttml);

console.log(`Hid ${ids.length} maker(s) after "${word}": ${ids.join(", ")}`);
console.log(`Original kept as ${path.basename(backup)}`);
