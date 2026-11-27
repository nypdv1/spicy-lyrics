// Record the Spotify window via CDP screencast → frames/ dir + timestamps.
// Usage: bun scripts/capture/record.ts <seconds> [outdir] [--from-first-lyric]

import { CDP } from "./cdp.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const seconds = Number(process.argv[2] ?? 12);
const outDir = process.argv[3] ?? "scripts/capture/frames";
const fromFirstLyric = process.argv.includes("--from-first-lyric");
mkdirSync(outDir, { recursive: true });

const cdp = await CDP.connectToPage();
await cdp.send("Page.enable");

if (fromFirstLyric) {
  console.log("seeking to 0 and waiting for first lyric line...");
  await cdp.evaluate("Spicetify.Player.seek(0)");
  // poll until the first lyric line becomes Active
  const deadline = Date.now() + 20000;
  for (;;) {
    const state = await cdp.evaluate<string>(`JSON.stringify({
      sung: document.querySelectorAll('#SpicyLyricsPage .LyricsContent .line.Sung').length,
      active: document.querySelectorAll('#SpicyLyricsPage .LyricsContent .line.Active').length,
      progress: Spicetify.Player.getProgress?.() ?? 0,
    })`);
    const s = JSON.parse(state);
    if (s.active >= 1 && s.sung === 0) break;
    if (Date.now() > deadline) { console.log("timed out waiting for first lyric, recording anyway", s); break; }
    await new Promise((r) => setTimeout(r, 30));
  }
  console.log("first lyric active — recording");
}

// grab the ContentBox rect (CSS px) so the post step can crop correctly
const rect = JSON.parse(await cdp.evaluate<string>(`JSON.stringify((() => {
  const el = document.querySelector('#SpicyLyricsPage .ContentBox') || document.getElementById('SpicyLyricsPage');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, dpr: devicePixelRatio };
})())`));
console.log("crop rect (css px):", rect);

const frames: { file: string; ts: number }[] = [];
let count = 0;

cdp.on("Page.screencastFrame", (params) => {
  const file = join(outDir, `f${String(count).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(params.data, "base64"));
  frames.push({ file, ts: params.metadata.timestamp });
  count++;
  cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
});

await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
await new Promise((r) => setTimeout(r, seconds * 1000));
await cdp.send("Page.stopScreencast").catch(() => {});
await new Promise((r) => setTimeout(r, 500));

writeFileSync(join(outDir, "timestamps.json"), JSON.stringify({ frames, rect }, null, 1));
console.log(`captured ${frames.length} frames`);
if (frames.length > 1) {
  const dur = frames[frames.length - 1].ts - frames[0].ts;
  console.log(`span ${dur.toFixed(2)}s → avg ${(frames.length / dur).toFixed(1)} fps`);
}
cdp.close();
process.exit(0);
