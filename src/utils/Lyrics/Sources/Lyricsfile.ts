import { CORE_SCHEMA, load } from "js-yaml";
import type { TimedWord, TimedWordLine } from "./Types.ts";

/*
 * Reads Lyricsfile 1.0 (github.com/tranxuanthang/lyricsfile, SPECIFICATION.md), the YAML format
 * LRCLIB serves word-timed lyrics in. Lines carry start_ms and an optional end_ms, and may hold
 * `words`, each with its own start_ms and optional end_ms; a word's text keeps the space after it.
 *
 * The draft leaves missing end times to the reader: a word here ends where the next one starts
 * (the last where its line does), and a line where it says, or else where the next line starts.
 */

// Lyrics files are a few kilobytes; anything far past that isn't one.
const MAX_LENGTH = 1_000_000;
// The replacement character, which only ever stands where an upload lost a character.
const REPLACEMENT_CHARACTER = new RegExp(String.fromCharCode(0xfffd), "g");

type Mapping = Record<string, unknown>;
const isMapping = (value: unknown): value is Mapping =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const cleanText = (text: string) => text.replace(REPLACEMENT_CHARACTER, "");

type RawWord = { text: string; start: number; end: number | null };
type RawLine = { text: string; start: number; end: number | null; words: RawWord[] };

export type ParsedLyricsfile = {
  instrumental: boolean;
  /** Word-timed lines, when the file has word timing on any line. */
  wordLines: TimedWordLine[] | null;
};

function readWords(value: unknown): RawWord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((word): word is Mapping => isMapping(word) && typeof word.text === "string" && isTime(word.start_ms))
    .map((word) => ({
      text: cleanText(word.text as string),
      start: word.start_ms as number,
      end: isTime(word.end_ms) && word.end_ms >= (word.start_ms as number) ? (word.end_ms as number) : null,
    }))
    .sort((a, b) => a.start - b.start);
}

function readLines(value: unknown): RawLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is Mapping => isMapping(line) && typeof line.text === "string" && isTime(line.start_ms))
    .map((line) => ({
      text: cleanText(line.text as string),
      start: line.start_ms as number,
      end: isTime(line.end_ms) && line.end_ms >= (line.start_ms as number) ? (line.end_ms as number) : null,
      words: readWords(line.words),
    }))
    .sort((a, b) => a.start - b.start);
}

function toTimedWords(words: RawWord[], lineEnd: number): TimedWord[] {
  const timed: TimedWord[] = [];
  words.forEach((word, index) => {
    const text = word.text.trim();
    if (!text) {
      // A segment that is only a space ends the word before it.
      const previous = timed[timed.length - 1];
      if (previous) previous.isPartOfWord = false;
      return;
    }
    const next = words[index + 1];
    const end = word.end ?? (next ? next.start : lineEnd);
    timed.push({
      text,
      startTimeMs: word.start,
      endTimeMs: Math.max(word.start, end),
      // No space between this and the next segment: they're one word, sung in parts.
      isPartOfWord: !!next && !/\s$/.test(word.text) && !/^\s/.test(next.text),
    });
  });
  const last = timed[timed.length - 1];
  if (last) last.isPartOfWord = false;
  return timed;
}

/**
 * The lyrics in a Lyricsfile document, or null when it isn't a readable version 1.0 file. Only
 * plain YAML values are accepted (no custom tags); a duplicate key makes the document invalid.
 */
export function ParseLyricsfile(text: unknown, trackDurationMs: number): ParsedLyricsfile | null {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_LENGTH) return null;
  let document: unknown;
  try {
    document = load(text, { schema: CORE_SCHEMA });
  } catch {
    return null;
  }
  // An unknown version isn't read as 1.0.
  if (!isMapping(document) || document.version !== "1.0" || !isMapping(document.metadata)) return null;

  const instrumental = document.metadata.instrumental === true;
  const lines = readLines(document.lines);
  if (instrumental || !lines.some((line) => line.words.length > 0)) {
    return { instrumental, wordLines: null };
  }

  const wordLines: TimedWordLine[] = [];
  lines.forEach((line, index) => {
    const nextStart = lines.slice(index + 1).find((later) => later.start > line.start)?.start;
    const lastWordStart = line.words[line.words.length - 1]?.start ?? line.start;
    const lineEnd = Math.max(
      line.end ?? nextStart ?? (trackDurationMs > lastWordStart ? trackDurationMs : lastWordStart),
      lastWordStart
    );
    // A line without word timing still shows, lit as a whole.
    const words = line.words.length > 0
      ? toTimedWords(line.words, lineEnd)
      : line.text.trim()
        ? [{ text: line.text.trim(), startTimeMs: line.start, endTimeMs: lineEnd, isPartOfWord: false }]
        : [];
    if (words.length === 0) return;
    wordLines.push({
      startTimeMs: Math.min(line.start, words[0].startTimeMs),
      endTimeMs: Math.max(lineEnd, words[words.length - 1].endTimeMs),
      words,
    });
  });

  return { instrumental: false, wordLines: wordLines.length > 0 ? wordLines : null };
}
