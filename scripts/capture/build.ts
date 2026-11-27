// Build transparent rounded-corner video from captured screencast frames.
// Usage: bun scripts/capture/build.ts <framesDir> <outPrefix>
// Outputs: <outPrefix>.webm (VP9 + alpha) and <outPrefix>-poster.png (first good frame)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const framesDir = process.argv[2] ?? "scripts/capture/frames";
const outPrefix = process.argv[3] ?? "previews/lyrics-demo";

const meta = JSON.parse(readFileSync(join(framesDir, "timestamps.json"), "utf8"));
const { frames, rect } = meta as { frames: { file: string; ts: number }[]; rect: { x: number; y: number; w: number; h: number; dpr: number } };

// CSS px → frame px
const s = rect.dpr;
const even = (n: number) => Math.round(n / 2) * 2;
const cx = Math.round(rect.x * s), cy = Math.round(rect.y * s);
const cw = even(rect.w * s), ch = even(rect.h * s);
console.log(`crop: ${cw}x${ch}+${cx}+${cy}`);

// concat demuxer list with real per-frame durations
let list = "";
for (let i = 0; i < frames.length; i++) {
  const dur = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 0.02;
  list += `file '${frames[i].file.split(/[\\/]/).pop()}'\nduration ${Math.min(dur, 0.1).toFixed(4)}\n`;
}
writeFileSync(join(framesDir, "concat.txt"), list);

// rounded-rect mask, 4x supersampled for anti-aliased edges → PGM
const R = 12, SS = 4;
const W = cw, H = ch;
const cov = new Uint8Array(W * H);
const inside = (x: number, y: number) => {
  const inX = x >= R && x < W - R, inY = y >= R && y < H - R;
  if (inX || inY) return true;
  const cx0 = x < R ? R : W - R, cy0 = y < R ? R : H - R;
  return (x - cx0) ** 2 + (y - cy0) ** 2 <= R * R;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let hits = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
  }
  cov[y * W + x] = Math.round((hits / (SS * SS)) * 255);
}
const maskPath = join(framesDir, "mask.pgm");
writeFileSync(maskPath, Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), Buffer.from(cov)]));

// NOTE: eof_action=endall is required — the mask loops forever and the default
// framesync "repeat" would extend the video indefinitely.
const vf = `fps=30,crop=${cw}:${ch}:${cx}:${cy},format=rgba[main];[1:v]format=gray,loop=loop=-1:size=1[mask];[main][mask]alphamerge=eof_action=endall,format=yuva420p`;

// transparent webm (vp9 + alpha — CPU-only, no GPU encoder supports alpha)
await $`ffmpeg -y -f concat -safe 0 -i ${join(framesDir, "concat.txt")} -i ${maskPath} -filter_complex "[0:v]${vf}[v]" -map "[v]" -c:v libvpx-vp9 -b:v 0 -crf 34 -cpu-used 5 -row-mt 1 -threads 8 -auto-alt-ref 0 -an ${outPrefix}.webm`;

// poster PNG (needs the libvpx decoder to see alpha)
await $`ffmpeg -y -v error -c:v libvpx-vp9 -i ${outPrefix}.webm -vf "select=eq(n\,90),format=rgba" -vframes 1 ${outPrefix}-poster.png`;

console.log("done:", `${outPrefix}.webm`, `${outPrefix}-poster.png`);
