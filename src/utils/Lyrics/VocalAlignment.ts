import type { VocalCurve } from "./VocalCurve.ts";

/**
 * Places unsynced lines on a song's singing.
 *
 * Every line gets a share of the song's sung time from its text, and the line
 * breaks are moved onto pauses in the singing. Each step of the search covers
 * one or more lines between two pauses: its cost is how far the singing between
 * them is from what the text predicts, minus a reward for ending on a real
 * pause. Long pauses inside a step cost extra, and stanza breaks (blank lines)
 * want long pauses. Several lines in one step are split by text inside it, for
 * verses sung without a breath between lines.
 */

// Most lines one step may cover.
const MAX_LINES_PER_STEP = 4;
// Singing between two pauses may be this many times shorter or longer than predicted.
const MAX_STRETCH = 4;
// Cost per second of singing left before the first line or after the last.
const SKIPPED_SINGING_COST = 0.06;
// Cost of a line break that falls inside singing instead of on a pause.
const UNANCHORED_BREAK_COST = 0.25;
// Extra cost when that break is a stanza break.
const UNANCHORED_STANZA_COST = 0.6;
// Reward for a line break on a pause, per second of pause, up to the cap.
const PAUSE_REWARD = 0.35;
const PAUSE_REWARD_CAP = 1.5;
// Further reward for a stanza break on a pause, per second, up to the cap.
const STANZA_PAUSE_REWARD = 0.35;
const STANZA_PAUSE_REWARD_CAP = 4;
// Pauses longer than this inside a line cost per extra second.
const INNER_PAUSE_ALLOWANCE = 0.8;
const INNER_PAUSE_COST = 0.5;

export type AlignedLine = { start: number; end: number };

type Step = { fromPause: number; firstLine: number };

function align(
  weights: number[],
  stanzaAfter: boolean[],
  curve: VocalCurve,
  sungPerWeight: number
): { cost: number; steps: Step[]; lastPause: number } | null {
  const lineCount = weights.length;
  const pauses = curve.pauses;
  const pauseCount = pauses.length;

  const weightSums = new Float64Array(lineCount + 1);
  for (let i = 0; i < lineCount; i++) weightSums[i + 1] = weightSums[i] + weights[i];
  const stanzaSums = new Int32Array(lineCount + 1);
  for (let i = 0; i < lineCount; i++) stanzaSums[i + 1] = stanzaSums[i] + (stanzaAfter[i] ? 1 : 0);
  // innerSums[j] is the long-pause cost of pauses 0..j-1.
  const innerSums = new Float64Array(pauseCount + 1);
  for (let j = 0; j < pauseCount; j++) {
    const length = pauses[j].end - pauses[j].start;
    innerSums[j + 1] = innerSums[j] + Math.max(0, length - INNER_PAUSE_ALLOWANCE) * INNER_PAUSE_COST;
  }

  const stride = pauseCount;
  const cost = new Float64Array((lineCount + 1) * stride).fill(Number.POSITIVE_INFINITY);
  const fromPause = new Int32Array((lineCount + 1) * stride).fill(-1);
  const fromLine = new Int32Array((lineCount + 1) * stride).fill(-1);

  for (let j = 0; j < pauseCount; j++) cost[j] = pauses[j].sung * SKIPPED_SINGING_COST;

  for (let i = 0; i < lineCount; i++) {
    for (let a = 0; a < pauseCount; a++) {
      const base = cost[i * stride + a];
      if (!Number.isFinite(base)) continue;
      const fromSung = pauses[a].sung;

      for (let k = 1; k <= MAX_LINES_PER_STEP && i + k <= lineCount; k++) {
        const next = i + k;
        const expected = sungPerWeight * (weightSums[next] - weightSums[i]);
        if (expected <= 0) continue;
        const innerBreaks = k - 1;
        const innerStanzas = stanzaSums[next - 1] - stanzaSums[i];
        const stepBase =
          base + innerBreaks * UNANCHORED_BREAK_COST + innerStanzas * UNANCHORED_STANZA_COST;
        const isLast = next === lineCount;

        for (let b = a + 1; b < pauseCount; b++) {
          const sung = pauses[b].sung - fromSung;
          if (sung > expected * MAX_STRETCH) break;
          if (sung < expected / MAX_STRETCH) continue;

          const stretch = Math.log(sung / expected);
          let total = stepBase + k * stretch * stretch + (innerSums[b] - innerSums[a + 1]);
          if (!isLast) {
            const length = pauses[b].end - pauses[b].start;
            total -= PAUSE_REWARD * Math.min(length, PAUSE_REWARD_CAP);
            if (stanzaAfter[next - 1]) {
              total -= STANZA_PAUSE_REWARD * Math.min(length, STANZA_PAUSE_REWARD_CAP);
            }
          }

          const cell = next * stride + b;
          if (total < cost[cell]) {
            cost[cell] = total;
            fromPause[cell] = a;
            fromLine[cell] = i;
          }
        }
      }
    }
  }

  let best = Number.POSITIVE_INFINITY;
  let lastPause = -1;
  for (let b = 0; b < pauseCount; b++) {
    const value = cost[lineCount * stride + b];
    if (!Number.isFinite(value)) continue;
    const total = value + (curve.total - pauses[b].sung) * SKIPPED_SINGING_COST;
    if (total < best) {
      best = total;
      lastPause = b;
    }
  }
  if (lastPause < 0) return null;

  const steps: Step[] = [];
  let line = lineCount;
  let pause = lastPause;
  while (line > 0) {
    const cell = line * stride + pause;
    const a = fromPause[cell];
    const i = fromLine[cell];
    if (a < 0 || i < 0) return null;
    steps.unshift({ fromPause: a, firstLine: i });
    line = i;
    pause = a;
  }
  return { cost: best, steps, lastPause };
}

/**
 * Start and end times, in seconds, for lines with no timing of their own.
 * `weights` is how long each line takes to sing relative to the others, and
 * `stanzaAfter[i]` marks a blank line after line `i`. Null when the lines can't
 * be fitted to the singing.
 */
export function AlignLinesToVocals(
  weights: number[],
  stanzaAfter: boolean[],
  curve: VocalCurve
): AlignedLine[] | null {
  const lineCount = weights.length;
  if (!lineCount || curve.pauses.length < 2) return null;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return null;

  // First guess: the lyrics cover all the singing. Then again at the rate the
  // first pass actually found, since intros and outros often go unwritten.
  let result = align(weights, stanzaAfter, curve, curve.total / totalWeight);
  if (!result) return null;
  const covered = curve.pauses[result.lastPause].sung - curve.pauses[result.steps[0].fromPause].sung;
  if (covered > 0) {
    const second = align(weights, stanzaAfter, curve, covered / totalWeight);
    if (second && second.cost <= result.cost) result = second;
  }

  const weightSums = [0];
  for (const weight of weights) weightSums.push(weightSums[weightSums.length - 1] + weight);

  const lines: AlignedLine[] = Array.from({ length: lineCount });
  const { steps, lastPause } = result;
  steps.forEach((step, index) => {
    const nextLine = steps[index + 1]?.firstLine ?? lineCount;
    const from = curve.pauses[step.fromPause];
    const to = curve.pauses[steps[index + 1]?.fromPause ?? lastPause];
    const stepStart = from.end;
    const stepEnd = Math.max(stepStart, to.start);
    const stepWeight = weightSums[nextLine] - weightSums[step.firstLine];

    for (let line = step.firstLine; line < nextLine; line++) {
      const startShare = (weightSums[line] - weightSums[step.firstLine]) / stepWeight;
      const endShare = (weightSums[line + 1] - weightSums[step.firstLine]) / stepWeight;
      const start =
        line === step.firstLine
          ? stepStart
          : curve.startOf(from.sung + (to.sung - from.sung) * startShare);
      const end =
        line === nextLine - 1
          ? stepEnd
          : curve.endOf(from.sung + (to.sung - from.sung) * endShare);
      const clampedStart = Math.min(Math.max(start, stepStart), stepEnd);
      lines[line] = {
        start: clampedStart,
        end: Math.min(Math.max(end, clampedStart), stepEnd),
      };
    }
  });
  return lines;
}
