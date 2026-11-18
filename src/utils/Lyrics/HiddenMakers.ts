/*
 * Makers hidden in the lyrics text. Spicy Lyrics' server keeps one Maker and drops the rest of a
 * TTML's metadata, but it keeps the lyric text as written, invisible characters included. So the
 * Discord ids of everyone who made a sync ride along as zero-width characters after a word,
 * where no client shows them, and the credits read them back out.
 *
 * Format: four invisible characters are the base-4 digits 0 to 3. Each value is two of them, so
 * 0 to 15. 0 to 9 are decimal digits, 10 separates ids, 15 15 starts the payload and 14 ends it.
 */

const DIGITS = ["\u200b", "\u200c", "\u200d", "\u2060"] as const;
const DIGIT_VALUE = new Map<string, number>(DIGITS.map((digit, value) => [digit, value]));

const SEPARATOR = 10;
const END = 14;
const START = 15;

const symbol = (value: number) => DIGITS[value >> 2] + DIGITS[value & 3];
const START_MARK = symbol(START) + symbol(START);
const END_MARK = symbol(END);
const PAYLOAD = new RegExp(`${START_MARK}((?:[\\u200b\\u200c\\u200d\\u2060]{2})*?)${END_MARK}`, "g");
const DISCORD_ID = /^\d{15,21}$/;

/** The invisible text that carries these ids, to add after a word of a TTML. */
export function EncodeHiddenMakers(ids: string[]): string {
  const values = ids.filter((id) => DISCORD_ID.test(id)).join(",");
  return START_MARK + [...values].map((char) => symbol(char === "," ? SEPARATOR : Number(char))).join("") + END_MARK;
}

function decode(body: string): string[] {
  let text = "";
  for (let i = 0; i + 1 < body.length; i += 2) {
    const value = DIGIT_VALUE.get(body[i])! * 4 + DIGIT_VALUE.get(body[i + 1])!;
    if (value === SEPARATOR) text += ",";
    else if (value <= 9) text += String(value);
    else return [];
  }
  return text.split(",").filter((id) => DISCORD_ID.test(id));
}

type TextEntry = { Text?: string; [key: string]: unknown };

function* textEntries(lyrics: any): Generator<TextEntry> {
  if (Array.isArray(lyrics?.Lines)) yield* lyrics.Lines;
  for (const line of Array.isArray(lyrics?.Content) ? lyrics.Content : []) {
    if (typeof line?.Text === "string") yield line;
    for (const syllable of line?.Lead?.Syllables ?? []) yield syllable;
    for (const background of line?.Background ?? []) {
      for (const syllable of background?.Syllables ?? []) yield syllable;
    }
  }
}

/**
 * Takes the hidden makers out of the lyrics text, so they don't count as letters, and keeps their
 * ids on `lyrics.HiddenMakers` (in order, without repeats). Lyrics that were already read keep
 * the ids they had.
 */
export function ExtractHiddenMakers(lyrics: any): void {
  if (!lyrics || typeof lyrics !== "object") return;
  const ids: string[] = Array.isArray(lyrics.HiddenMakers) ? [...lyrics.HiddenMakers] : [];
  for (const entry of textEntries(lyrics)) {
    if (typeof entry.Text !== "string" || !entry.Text.includes(START_MARK)) continue;
    entry.Text = entry.Text.replace(PAYLOAD, (_match, body: string) => {
      ids.push(...decode(body));
      return "";
    });
  }
  const unique = [...new Set(ids)];
  if (unique.length > 0) lyrics.HiddenMakers = unique;
}
