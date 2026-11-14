import { $simpleLyricsMode, isBloomRenderer } from "../../../../utils/stores.ts";

// The shortest word that can be split, per mode.
const MinDuration = 1000;
const SimpleLyricsModeMinDuration = 1050;

const Spring = (letterLength: number, totalDuration: number) => {
  return totalDuration >= MinDuration;
};

// Bloom: only words held a second or more with two to seven letters are split.
// A word sung in syllables is judged as a whole: its letters and the time from
// its first syllable's start to its last one's end. A longer held word
// ("starfucker,") fills like any other word, and background vocals are never split.
export const RefreshedMaxLetters = 7;
const RefreshedMinLetters = 2;

const Bloom = (letterLength: number, totalDuration: number, isBackground: boolean) => {
  if (isBackground) return false;
  return (
    letterLength >= RefreshedMinLetters &&
    letterLength <= RefreshedMaxLetters &&
    totalDuration >= MinDuration
  );
};

// Simple Lyrics Mode without its Refreshed look: up to twelve letters, held a little longer.
const SimpleLyricsMode = (letterLength: number, totalDuration: number) => {
  if (letterLength > 12) return false;
  return totalDuration >= SimpleLyricsModeMinDuration;
};

/**
 * Below this duration IsLetterCapable is false whatever the letter count, so a caller can
 * skip splitting the word just to count its letters.
 */
export function MinLetterCapableDuration(): number {
  return $simpleLyricsMode.get() && !isBloomRenderer() ? SimpleLyricsModeMinDuration : MinDuration;
}

export function IsLetterCapable(letterLength: number, totalDuration: number, isBackground = false) {
  if (isBloomRenderer()) return Bloom(letterLength, totalDuration, isBackground);
  if ($simpleLyricsMode.get()) return SimpleLyricsMode(letterLength, totalDuration);
  return Spring(letterLength, totalDuration);
}
