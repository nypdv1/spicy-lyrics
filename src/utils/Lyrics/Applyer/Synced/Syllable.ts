import {
  $lyricsContainerExists,
  $minimalLyricsMode,
  $simpleLyricsMode,
  $spaceGravityMode,
  $syllableMerge,
  $syllablePace,
  $restartVocalStutters,
  isBloomRenderer,
} from "../../../../utils/stores.ts";
import { PageContainer } from "../../../../components/Pages/PageView.ts";
import { applyStyles, removeAllStyles } from "../../../CSS/Styles.ts";
import {
  ClearScrollSimplebar,
  MountScrollSimplebar,
  RecalculateScrollSimplebar,
  ScrollSimplebar,
} from "../../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { AdoptReappliedScrollPosition, HoldScrollToActiveButtonUntilVisible, InitializeScrollEvents, PositionInitialLyrics, QueueForceScroll, ScrollToActiveLine } from "../../../Scrolling/ScrollToActiveLine.ts";
import { getIdleEmphasisLyricsScale, getIdleLyricsScale } from "../../Animator/Shared.ts";
import { ConvertTime } from "../../ConvertTime.ts";
import { ClearLyricsPageContainer } from "../../fetchLyrics.ts";
import isRtl from "../../isRtl.ts";
import {
  ClearLyricsContentArrays,
  CurrentLineLyricsObject,
  LyricsObject,
  SetWordArrayInCurentLine,
  getInterludeTimePadding,
  getLyricsBetweenShow,
  setRomanizedStatus,
} from "../../lyrics.ts";
import { CreateLyricsContainer, DestroyAllLyricsContainers } from "../CreateLyricsContainer.ts";
import {
  destroyLyricsVirtualizer,
  initLyricsVirtualizer,
  releaseLyricsVirtualizerElements,
  type LyricsViewportAnchor,
} from "../../LyricsVirtualizer.ts";
import {
  mountSpaceGravity,
  restoreSpaceGravity,
  tickSpaceGravity,
} from "../../SpaceGravity.ts";
import { ApplyIsByCommunity } from "../Credits/ApplyIsByCommunity.tsx";
import { ApplyLyricsCredits, MarkLastLineSide } from "../Credits/ApplyLyricsCredits.ts";
import { ApplyExperimentalWordSyncNotice } from "../Credits/ApplyExperimentalWordSyncNotice.ts";
import { EmitApply, EmitNotApplyed } from "../OnApply.ts";
import Emphasize, { createFlameGroup, type FlameGroup, type SyllablePart } from "../Utils/Emphasize.ts";
import { StripZeroWidth } from "../Utils/StripZeroWidth.ts";
import { IsLetterCapable, MinLetterCapableDuration } from "../Utils/IsLetterCapable.ts";
import { SplitLetters } from "../Utils/SplitLetters.ts";
import { JoinSplitWords } from "../Utils/JoinSplitWords.ts";
import { PickPartOfWord } from "../Utils/PickDisplayText.ts";
import { AppendSyllableRomanization, RomanizeUnderLine } from "../Utils/RomanizedRow.ts";
import { HasRenderableText } from "../../EmptyLines.ts";
import Logger from "../../../Logger.ts";

const syllableLogger = new Logger("Syllable Lyrics");
import { ApplyLyricsProvider } from "../Credits/ApplyProvider.ts";
import { CreateLyricsFooter, PlaceLyricsFooter } from "../Credits/CreateLyricsFooter.ts";
import Defaults from "../../../../components/Global/Defaults.ts";
import { SpotifyPlayer } from "../../../../components/Global/SpotifyPlayer.ts";

// Define the data structure for syllable lyrics
interface SyllableData {
  Text: string;
  TransliteratedText?: string;
  GibberishText?: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord?: boolean;
  // Continues visually, but starts a fresh word-timing animation after this part.
  RestartStutterAfter?: boolean;
  // One displayed word can replay through several originally separate timings.
  RestartRanges?: Array<{ StartTime: number; EndTime: number }>;
  TransliteratedIsPartOfWord?: boolean;
  // A word joined from syllables keeps them here.
  Parts?: SyllableData[];
}

interface LeadData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableData[];
}

interface BackgroundData {
  StartTime: number;
  EndTime: number;
  Syllables: SyllableData[];
}

interface LineData {
  Lead: LeadData;
  Background?: BackgroundData[];
  OppositeAligned?: boolean;
}

interface LyricsData {
  Type: string;
  Content: LineData[];
  StartTime: number;
  SongWriters?: string[];
  source?: string;
  sourceDisplayName?: string;
  fetchProvider?: string;
  userUploaded?: boolean;
  experimentalWordSync?: boolean;
  experimentalWordSyncReason?: "SpaceGravity" | string;
  classes?: string;
  styles?: Record<string, string>;
}

// Joined before the empty parts are dropped, so a separator between two words
// still ends the run and they aren't joined across it. The romanization can end
// words the source text runs together (romaji under Japanese), so the romanized
// view takes its word breaks from there.
function renderableSyllables(
  syllables: SyllableData[],
  useRomanized: boolean,
  allowLetters: boolean
): SyllableData[] {
  const words = useRomanized
    ? syllables.map((s) =>
        s.TransliteratedIsPartOfWord === undefined ? s : { ...s, IsPartOfWord: s.TransliteratedIsPartOfWord }
      )
    : syllables;
  const stutters = repairVocalStutters(words);
  const merge = $syllableMerge.get();
  const parts =
    merge === "off"
      ? stutters
      : JoinSplitWords(stutters, merge, (word) => allowLetters && splitLetters(word, useRomanized) !== null);
  return parts.filter(HasRenderableText);
}

/**
 * Sources often flag a vocal stutter as separate words: "Te-", "te-", "test".
 * A repeated dashed prefix is not a normal hyphenated phrase, so connect those
 * elements without merging their time ranges; every fragment then restarts its
 * own word animation while the line reads naturally as "Te-te-test".
 */
function repairVocalStutters(syllables: SyllableData[]): SyllableData[] {
  if (!$restartVocalStutters.get() || syllables.length < 2) return syllables;
  const repaired = syllables.map((syllable) => ({ ...syllable }));
  const dashAtEnd = /[-\u2010-\u2015]\s*$/u;
  const dashOnly = /^\s*[-\u2010-\u2015]\s*$/u;
  const dashAtStart = /^\s*[-\u2010-\u2015]\s*/u;
  const lettersOnly = (text: string) => text.normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase();
  const matches: Array<{ prefixStart: number; prefixEnd: number; targetStart: number; targetEnd: number }> = [];

  for (let index = 0; index < repaired.length - 1; index++) {
    const current = repaired[index];
    const currentText = current.Text ?? "";
    let targetIndex = index + 1;
    let prefixText = currentText;
    let movesDashToCurrent = false;
    // Some providers time an em dash as its own word. Treat that punctuation
    // as the separator between two repeated starts as well.
    if (!dashAtEnd.test(prefixText) && dashOnly.test(repaired[targetIndex]?.Text ?? "")) {
      targetIndex++;
      prefixText = `${prefixText}-`;
    // Other providers put the dash at the start of the following timed word
    // (`Te`, `— test`). Move it to the preceding fragment after checking the
    // repeat, so the final display remains `Te-test` with no extra space.
    } else if (!dashAtEnd.test(prefixText) && dashAtStart.test(repaired[targetIndex]?.Text ?? "")) {
      prefixText = `${prefixText.trimEnd()}-`;
      movesDashToCurrent = true;
    }
    if (!dashAtEnd.test(prefixText)) continue;
    const target = repaired[targetIndex];
    if (!target) continue;
    const prefix = lettersOnly(prefixText.replace(dashAtEnd, ""));
    const nextText = (target.Text ?? "").replace(dashAtStart, "").trimStart();
    let repeatsPrefix = !!prefix && lettersOnly(nextText).startsWith(prefix);
    let phraseLength = 1;
    // A stutter can repeat a whole phrase, while the dash is only carried by
    // its final timed word: `Wake` + `up—`, `wake` + `up—`, `wake` + `up`.
    // Find the shortest repeated token sequence ending in that dashed word.
    // We still join only across the dash, preserving the phrase's inner spaces.
    if (!repeatsPrefix) {
      const maximumPhraseLength = Math.min(8, index + 1, repaired.length - targetIndex);
      for (let candidateLength = 2; candidateLength <= maximumPhraseLength; candidateLength++) {
        const prefixStart = index - candidateLength + 1;
        const phraseRepeats = Array.from({ length: candidateLength }).every((_, phraseIndex) => {
          const source = repaired[prefixStart + phraseIndex]?.Text ?? "";
          const destination = repaired[targetIndex + phraseIndex]?.Text ?? "";
          const sourceText = phraseIndex === candidateLength - 1
            ? source.replace(dashAtEnd, "")
            : source;
          const destinationText = phraseIndex === 0
            ? destination.replace(dashAtStart, "").trimStart()
            : destination;
          return lettersOnly(sourceText) !== "" && lettersOnly(sourceText) === lettersOnly(destinationText);
        });
        if (phraseRepeats) {
          repeatsPrefix = true;
          phraseLength = candidateLength;
          break;
        }
      }
    }
    // Only repair repeated starts (te- test), never an ordinary hyphenated
    // compound such as "well- known".
    if (!repeatsPrefix) continue;
    if (movesDashToCurrent) current.Text = prefixText;
    current.IsPartOfWord = true;
    current.RestartStutterAfter = true;
    for (let separator = index + 1; separator < targetIndex; separator++) repaired[separator].IsPartOfWord = true;
    if (nextText !== target.Text) target.Text = nextText;
    matches.push({
      prefixStart: index - phraseLength + 1,
      prefixEnd: index,
      targetStart: targetIndex,
      targetEnd: targetIndex + phraseLength - 1,
    });
  }
  return collapseVocalStutters(repaired, matches);
}

// `te-`, `te-`, `test` should render once as `test`.  Preserve every original
// time range, though: the animator uses them to replay that one word at each
// vocal restart instead of showing three independently animated fragments.
function collapseVocalStutters(
  syllables: SyllableData[],
  matches: Array<{ prefixStart: number; prefixEnd: number; targetStart: number; targetEnd: number }>
): SyllableData[] {
  if (matches.length === 0) return syllables;
  const groups: Array<typeof matches> = [];
  for (const match of matches) {
    const previous = groups[groups.length - 1];
    const previousEnd = previous ? Math.max(...previous.map((entry) => entry.targetEnd)) : -1;
    if (previous && match.prefixStart <= previousEnd + 1) previous.push(match);
    else groups.push([match]);
  }

  const collapsed: SyllableData[] = [];
  let groupIndex = 0;
  for (let index = 0; index < syllables.length; index++) {
    const group = groups[groupIndex];
    if (!group || index !== group[0].prefixStart) {
      collapsed.push(syllables[index]);
      continue;
    }

    const lastMatch = group[group.length - 1];
    const last = lastMatch.targetEnd;
    const display = syllables.slice(lastMatch.targetStart, last + 1);
    const final = display[display.length - 1];
    const joinPhraseText = (pick: (part: SyllableData) => string) =>
      display.reduce(
        (joined, part, partIndex) =>
          `${joined}${partIndex > 0 && !display[partIndex - 1].IsPartOfWord ? " " : ""}${pick(part)}`,
        ""
      );
    const text = joinPhraseText((part) => part.Text ?? "");
    const phraseRanges = [
      { start: group[0].prefixStart, end: group[0].prefixEnd },
      ...group.map((entry) => ({ start: entry.targetStart, end: entry.targetEnd })),
    ];
    collapsed.push({
      ...final,
      Text: text,
      ...(display.some((part) => part.TransliteratedText !== undefined)
        ? { TransliteratedText: joinPhraseText((part) => part.TransliteratedText ?? part.Text ?? "") }
        : {}),
      ...(display.some((part) => part.GibberishText !== undefined)
        ? { GibberishText: joinPhraseText((part) => part.GibberishText ?? part.Text ?? "") }
        : {}),
      StartTime: syllables[index].StartTime,
      EndTime: final.EndTime,
      RestartRanges: phraseRanges.map(({ start, end }) => ({
        StartTime: syllables[start].StartTime,
        EndTime: syllables[end].EndTime,
      })),
    });
    index = last;
    groupIndex++;
  }
  return collapsed;
}

// A syllable's letters when it's held long enough to be drawn letter by letter, else null.
function splitLetters(syllable: SyllableData, useRomanized: boolean): string[] | null {
  const duration = ConvertTime(syllable.EndTime) - ConvertTime(syllable.StartTime);
  // Too short to split whatever its letters: skip the grapheme split.
  if (duration < MinLetterCapableDuration()) return null;
  const text = StripZeroWidth(getSyllableText(syllable, useRomanized));
  const letters = SplitLetters(text);
  return letters.length > 0 && IsLetterCapable(letters.length, duration) && !isRtl(text) ? letters : null;
}

// With Keep Syllable Pace, where each syllable of a joined word starts and how
// many of its letters it has, so Emphasize can time them by syllable. Undefined
// for a word that wasn't joined, or whose syllables split into other letters.
function pacedParts(
  syllable: SyllableData,
  useRomanized: boolean,
  letterCount: number
): SyllablePart[] | undefined {
  if (!syllable.Parts || !$syllablePace.get()) return undefined;
  const parts = syllable.Parts.map((part) => ({
    StartTime: part.StartTime,
    Letters: SplitLetters(StripZeroWidth(getSyllableText(part, useRomanized))).length,
  }));
  return parts.reduce((sum, part) => sum + part.Letters, 0) === letterCount ? parts : undefined;
}

// Bloom judges a word sung in syllables as a whole: whether it's split into
// letters, and how far the fill edge runs past it, go by the whole word's
// letters and length. Spring keeps judging each syllable alone.
type WordPlan = { Letters: string[]; Split: boolean; WordLetters: number; Group: FlameGroup | null };

function planWords(
  parts: SyllableData[],
  useRomanized: boolean,
  isBackground: boolean,
  allowLetters: boolean
): WordPlan[] {
  const texts = parts.map((part) => StripZeroWidth(getSyllableText(part, useRomanized)));
  const durations = parts.map((part) => ConvertTime(part.EndTime) - ConvertTime(part.StartTime));
  const lettersOf = (i: number, duration: number) =>
    allowLetters && !parts[i].RestartRanges && duration >= MinLetterCapableDuration()
      ? SplitLetters(texts[i])
      : [];
  const plans: WordPlan[] = [];
  for (let i = 0; i < parts.length; i++) {
    let end = i;
    if (isBloomRenderer()) {
      while (
        PickPartOfWord(parts[end], useRomanized) &&
        !parts[end].RestartStutterAfter &&
        end + 1 < parts.length
      ) end++;
    }
    if (end === i) {
      const letters = lettersOf(i, durations[i]);
      plans.push({
        Letters: letters,
        Split:
          letters.length > 0 && IsLetterCapable(letters.length, durations[i], isBackground) && !isRtl(texts[i]),
        WordLetters: letters.length || SplitLetters(texts[i]).length,
        Group: null,
      });
      continue;
    }
    const duration = ConvertTime(parts[end].EndTime) - ConvertTime(parts[i].StartTime);
    const letters = parts.slice(i, end + 1).map((_, k) => lettersOf(i + k, duration));
    const total = letters.reduce((sum, l) => sum + l.length, 0);
    const split =
      total > 0 &&
      IsLetterCapable(total, duration, isBackground) &&
      !texts.slice(i, end + 1).some((text) => isRtl(text));
    const group = split ? createFlameGroup(parts[i].StartTime, parts[end].EndTime) : null;
    for (let k = 0; k <= end - i; k++) {
      plans.push({
        Letters: letters[k],
        Split: split && letters[k].length > 0,
        WordLetters: total || texts.slice(i, end + 1).join("").length,
        Group: group,
      });
    }
    i = end;
  }
  return plans;
}

// The whole word's letter count, for the fill edge (see getLineSweep).
const tagWordLetters = (count: number) => {
  const lead = LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead;
  const entry = lead?.[lead.length - 1] as { WordLetters?: number } | undefined;
  if (entry) entry.WordLetters = count;
};

// Spring with the full word animation: not Simple Lyrics Mode, not Bloom.
const usesSpringWordStyles = (): boolean => !$simpleLyricsMode.get() && !isBloomRenderer();

function getSyllableText(syllable: SyllableData, useRomanized: boolean): string {
  if (Defaults.MemeFormat !== "Off" && syllable.GibberishText !== undefined) {
    return syllable.GibberishText;
  }
  return useRomanized && syllable.TransliteratedText !== undefined
    ? syllable.TransliteratedText
    : syllable.Text || syllable.TransliteratedText || "";
}

function setSyllableTextVariants(
  element: HTMLElement,
  syllable: SyllableData,
  displayedText: string
): void {
  const isGibberish = Defaults.MemeFormat !== "Off" && syllable.GibberishText !== undefined;
  element.dataset.lyricsOriginalText = isGibberish ? displayedText : syllable.Text;
  element.dataset.lyricsRomanizedText = isGibberish
    ? displayedText
    : syllable.TransliteratedText ?? syllable.Text;

  if (isGibberish) {
    element.dataset.spaceGravityOriginalWordEnd = `${!syllable.IsPartOfWord}`;
  } else {
    delete element.dataset.spaceGravityOriginalWordEnd;
  }
}

function replaceLetterGroupText(word: any, text: string): void {
  const letters = Array.from(text);
  const existingLetters = word.Letters as Array<any> | undefined;

  if (existingLetters?.length === letters.length) {
    existingLetters.forEach((letter, index) => {
      letter.HTMLElement.textContent = letters[index];
    });
    return;
  }

  const totalDuration = word.EndTime - word.StartTime;
  const letterDuration = letters.length > 0 ? totalDuration / letters.length : totalDuration;
  word.HTMLElement.replaceChildren();
  word.Letters = letters.map((letter, index) => {
    const element = document.createElement("span");
    element.textContent = letter;
    element.classList.add("letter", "Emphasis");
    if (index === letters.length - 1) element.classList.add("LastLetterInWord");
    if (usesSpringWordStyles()) element.style.setProperty("--gradient-position", "-20%");
    element.style.setProperty("--text-shadow-opacity", "0%");
    element.style.setProperty("--text-shadow-blur-radius", "4px");
    element.style.scale = getIdleEmphasisLyricsScale().toString();
    element.style.transform = "translateY(calc(var(--DefaultLyricsSize) * 0.02))";
    word.HTMLElement.appendChild(element);
    return {
      HTMLElement: element,
      StartTime: word.StartTime + index * letterDuration,
      EndTime: word.StartTime + (index + 1) * letterDuration,
      TotalTime: letterDuration,
      Emphasis: true,
      ...(word.BGWord ? { BGLetter: true } : {}),
    };
  });
}

export function UpdateSyllableLyricsRomanization(useRomanized: boolean): void {
  const gravitySession = syllableRenderSession?.SpaceGravity ? syllableRenderSession : null;
  if (gravitySession) restoreSpaceGravity();

  for (const line of LyricsObject.Types.Syllable.Lines) {
    for (const word of line.Syllables?.Lead ?? []) {
      if (word.Dot) continue;
      const text = useRomanized
        ? word.HTMLElement.dataset.lyricsRomanizedText
        : word.HTMLElement.dataset.lyricsOriginalText;
      if (text === undefined) continue;

      const displayText = StripZeroWidth(text);
      if (word.LetterGroup) replaceLetterGroupText(word, displayText);
      else word.HTMLElement.textContent = displayText;
    }
  }

  if (gravitySession) {
    mountSpaceGravity(
      gravitySession.VirtualContainer,
      gravitySession.Lines,
      gravitySession.Container,
      gravitySession.Footer
    );
    tickSpaceGravity(SpotifyPlayer.GetPosition());
  }
}

function shouldJoinSyllableToNext(
  syllable: SyllableData,
  isLastInLine: boolean,
  useRomanized: boolean
): boolean {
  if (PickPartOfWord(syllable, useRomanized)) return true;
  return (
    Defaults.MemeFormat === "Gibberish" &&
    syllable.GibberishText !== undefined &&
    !isLastInLine
  );
}

type SyllableRenderSession = {
  Host: HTMLElement;
  Container: HTMLElement;
  VirtualContainer: HTMLElement;
  Lines: typeof LyricsObject.Types.Syllable.Lines;
  LineElements: HTMLElement[];
  Footer: HTMLElement;
  SpaceGravity: boolean;
};

let syllableRenderSession: SyllableRenderSession | null = null;

export function ClearSyllableRenderSession(): void {
  syllableRenderSession = null;
}

/** Switch layouts without rebuilding words, letters, credits, or lyric data. */
export function UpdateRenderedSpaceGravity(enabled: boolean): boolean {
  const session = syllableRenderSession;
  if (!session || !session.Container.isConnected || session.SpaceGravity === enabled) return false;

  if (enabled) {
    PageContainer?.classList.add("SpaceGravityMode");
    const released = releaseLyricsVirtualizerElements();
    destroyLyricsVirtualizer();
    if (released.length > 0) session.LineElements = released;
    ClearScrollSimplebar();
    // SimpleBar keeps an internal wrapper/mask/content tree. Gravity's stage
    // is sized against the real LyricsContent host, exactly like first render;
    // leaving it in that shell defers a usable size until the page is hidden.
    session.Host.replaceChildren(session.Container);
    session.VirtualContainer.style.removeProperty("height");
    PlaceLyricsFooter(session.Footer, session.Container, session.Host, true);
    session.Container.classList.add("SpaceGravityStage");
    mountSpaceGravity(session.VirtualContainer, session.Lines, session.Container, session.Footer);
    tickSpaceGravity(SpotifyPlayer.GetPosition());
  } else {
    const restoredLines = restoreSpaceGravity();
    session.Lines = restoredLines as typeof LyricsObject.Types.Syllable.Lines;
    session.LineElements = restoredLines.map((line) => line.HTMLElement);
    session.Container.classList.remove("SpaceGravityStage");
    session.VirtualContainer.replaceChildren();
    PageContainer?.classList.remove("SpaceGravityMode");
    // Fresh normal mode owns a fresh SimpleBar tree. This also fixes pages
    // opened in gravity mode, where no scroll instance exists yet.
    session.Host.replaceChildren(session.Container);
    PlaceLyricsFooter(session.Footer, session.Container, session.Host);
    MountScrollSimplebar();
    const scrollEl = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
    if (scrollEl && ScrollSimplebar) {
      InitializeScrollEvents(ScrollSimplebar);
      initLyricsVirtualizer(scrollEl, session.VirtualContainer, session.LineElements);
    }
    QueueForceScroll();
    // The normal playback tick may not arrive for a while. Let the new
    // virtualizer mount first, then consume the queued correction so its
    // visibility check cannot briefly show an incorrect "go to active" button.
    const renderWindow = session.Container.ownerDocument.defaultView ?? window;
    renderWindow.requestAnimationFrame(() => renderWindow.requestAnimationFrame(() => {
      if (syllableRenderSession === session && !session.SpaceGravity && ScrollSimplebar) {
        HoldScrollToActiveButtonUntilVisible();
        ScrollToActiveLine(ScrollSimplebar);
      }
    }));
  }

  session.SpaceGravity = enabled;
  return true;
}

export function ApplySyllableLyrics(
  data: LyricsData,
  UseRomanized: boolean = false,
  viewportAnchor: LyricsViewportAnchor | null = null
): void {
  if (!$lyricsContainerExists.get()) return;
  // Under each line, the line keeps its own text and the romanization gets a row below it.
  const UnderLine = RomanizeUnderLine();
  const ShowRomanized = UseRomanized && !UnderLine;
  EmitNotApplyed();

  DestroyAllLyricsContainers();
  ClearSyllableRenderSession();
  const LyricsContainerParent = PageContainer?.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (!viewportAnchor) LyricsContainerParent?.classList.add("InitialPositionPending");
  const LyricsContainerInstance = CreateLyricsContainer(viewportAnchor !== null);
  const LyricsContainer = LyricsContainerInstance.Container;

  // Check if LyricsContainer exists
  if (!LyricsContainer) {
    syllableLogger.error("LyricsContainer not found");
    return;
  }

  const hasOppositeAligned = data.Content.some(item => item.OppositeAligned === true);
  LyricsContainer.classList.toggle("HasDuetLines", hasOppositeAligned);
  const hasRtlLines = data.Content.some(line =>
    line.Lead.Syllables.some(syllable => isRtl(syllable.Text)) ||
    line.Background?.some(bg => bg.Syllables.some(syllable => isRtl(syllable.Text))) === true
  );
  LyricsContainer.classList.toggle("HasRtlLines", hasRtlLines);
  const lastLine = data.Content[data.Content.length - 1];
  MarkLastLineSide(
    LyricsContainer,
    !!lastLine?.OppositeAligned,
    !!lastLine?.Lead.Syllables.some(syllable => isRtl(syllable.Text))
  );

  LyricsContainer.setAttribute("data-lyrics-type", "Syllable");

  ClearLyricsContentArrays();
  ClearScrollSimplebar();

  ClearLyricsPageContainer();

  const virtualContainer = document.createElement("div");
  virtualContainer.classList.add("VirtualLyricsContainer");
  LyricsContainer.appendChild(virtualContainer);

  const lineElements: HTMLElement[] = [];
  const enableSpaceGravityAfterMount = $spaceGravityMode.get();
  // First render through SimpleBar so the lyrics host has stable dimensions.
  // Gravity's mounted-session switch owns the subsequent DOM transition.
  const spaceGravityMode = false;
  const allowLetterEmphasis = !data.experimentalWordSync;

  if (data.StartTime >= getLyricsBetweenShow()) {
    const musicalLine = document.createElement("div");
    musicalLine.classList.add("line");
    musicalLine.classList.add("musical-line");
    LyricsObject.Types.Syllable.Lines.push({
      HTMLElement: musicalLine,
      StartTime: 0,
      EndTime: ConvertTime(data.StartTime),
      TotalTime: ConvertTime(data.StartTime),
      DotLine: true,
    });

    SetWordArrayInCurentLine();

    if (data.Content[0].OppositeAligned) {
      musicalLine.classList.add("OppositeAligned");
    }

    const dotGroup = document.createElement("div");
    dotGroup.classList.add("dotGroup");

    const musicalDots1 = document.createElement("span");
    const musicalDots2 = document.createElement("span");
    const musicalDots3 = document.createElement("span");

    const totalTime = ConvertTime(data.StartTime);
    const baseDotTime = totalTime / 3;
    const dotPadding = getInterludeTimePadding() / 3;
    const dot1EndTime = Math.max(0, baseDotTime + dotPadding);
    const dot2EndTime = Math.max(dot1EndTime, baseDotTime * 2 + dotPadding * 2);
    const dot3EndTime = Math.max(dot2EndTime, totalTime + getInterludeTimePadding());

    musicalDots1.classList.add("word");
    musicalDots1.classList.add("dot");
    musicalDots1.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots1,
        StartTime: 0,
        EndTime: dot1EndTime,
        TotalTime: dot1EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    musicalDots2.classList.add("word");
    musicalDots2.classList.add("dot");
    musicalDots2.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots2,
        StartTime: dot1EndTime,
        EndTime: dot2EndTime,
        TotalTime: dot2EndTime - dot1EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    musicalDots3.classList.add("word");
    musicalDots3.classList.add("dot");
    musicalDots3.textContent = "•";

    // Check if Syllables.Lead exists
    if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
      LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
        HTMLElement: musicalDots3,
        StartTime: dot2EndTime,
        EndTime: dot3EndTime,
        TotalTime: dot3EndTime - dot2EndTime,
        Dot: true,
      });
    } else {
      console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
    }

    dotGroup.appendChild(musicalDots1);
    dotGroup.appendChild(musicalDots2);
    dotGroup.appendChild(musicalDots3);

    musicalLine.appendChild(dotGroup);
    lineElements.push(musicalLine);
  }
  data.Content.forEach((line, index, arr) => {
    const lineElem = document.createElement("div");
    lineElem.classList.add("line");

    const processedLeadSyllables = renderableSyllables(line.Lead.Syllables, ShowRomanized, allowLetterEmphasis);
    const leadPlans = planWords(processedLeadSyllables, ShowRomanized, false, allowLetterEmphasis);
    const nextLineStartTime = arr[index + 1]?.Lead.StartTime ?? 0;

    const lineEndTimeAndNextLineStartTimeDistance =
      nextLineStartTime !== 0 ? nextLineStartTime - line.Lead.EndTime : 0;

    // Fade Away Previous Lines and Bloom keep a line active until the next one
    // starts, unless the gap is long enough for an interlude.
    const lineEndTime =
      $minimalLyricsMode.get() || isBloomRenderer()
        ? nextLineStartTime === 0
          ? line.Lead.EndTime
          : lineEndTimeAndNextLineStartTimeDistance < getLyricsBetweenShow() &&
              nextLineStartTime > line.Lead.EndTime
            ? nextLineStartTime
            : line.Lead.EndTime
        : line.Lead.EndTime;

    LyricsObject.Types.Syllable.Lines.push({
      HTMLElement: lineElem,
      StartTime: ConvertTime(line.Lead.StartTime),
      EndTime: ConvertTime(lineEndTime),
      TotalTime: ConvertTime(lineEndTime) - ConvertTime(line.Lead.StartTime),
      LeadEndTime: ConvertTime(line.Lead.EndTime),
    });

    SetWordArrayInCurentLine();

    if (line.OppositeAligned) {
      lineElem.classList.add("OppositeAligned");
    }

    lineElements.push(lineElem);

    let currentWordGroup: HTMLSpanElement | null = null;

    processedLeadSyllables.forEach((lead, iL, aL) => {
      let word = document.createElement("span");
      const isLastInLine = iL === aL.length - 1;
      const shouldJoinToNext = shouldJoinSyllableToNext(lead, isLastInLine, ShowRomanized);

      if (isRtl(lead.Text) && !lineElem.classList.contains("rtl")) {
        lineElem.classList.add("rtl");
      }

      const totalDuration = ConvertTime(lead.EndTime) - ConvertTime(lead.StartTime);

      const leadText = StripZeroWidth(getSyllableText(lead, ShowRomanized));
      const plan = leadPlans[iL];
      const letters = plan.Letters;

      if (plan.Split) {
        word = document.createElement("div");
        Emphasize(letters, word, lead, false, pacedParts(lead, ShowRomanized, letters.length), plan.Group, lead.RestartRanges);
        tagWordLetters(plan.WordLetters);

        if (isLastInLine) {
          word.classList.add("LastWordInLine");
        } else if (shouldJoinToNext) {
          word.classList.add("PartOfWord");
        }

        if (usesSpringWordStyles()) {
          word.style.setProperty("--text-shadow-opacity", `0%`);
          word.style.setProperty("--text-shadow-blur-radius", `4px`);
          word.style.scale = getIdleEmphasisLyricsScale().toString();
          word.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;
        }
      } else {
        word.textContent = leadText;

        if (usesSpringWordStyles()) {
          word.style.setProperty("--gradient-position", `-20%`);
          word.style.setProperty("--text-shadow-opacity", `0%`);
          word.style.setProperty("--text-shadow-blur-radius", `4px`);
          word.style.scale = getIdleLyricsScale().toString();
          word.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.01))`;
        }

        word.classList.add("word");

        if (isLastInLine) {
          word.classList.add("LastWordInLine");
        } else if (shouldJoinToNext) {
          word.classList.add("PartOfWord");
        }

        if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
          LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
            HTMLElement: word,
            StartTime: ConvertTime(lead.StartTime),
            EndTime: ConvertTime(lead.EndTime),
            TotalTime: totalDuration,
            ...(lead.RestartRanges ? { RestartRanges: lead.RestartRanges.map((range) => ({
              StartTime: ConvertTime(range.StartTime),
              EndTime: ConvertTime(range.EndTime),
            })) } : {}),
          });
          tagWordLetters(plan.WordLetters);
        } else {
          console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
        }
      }

      setSyllableTextVariants(word, lead, leadText);

      const prev = aL[iL - 1];
      const prevShouldJoinToNext = prev ? shouldJoinSyllableToNext(prev, false, ShowRomanized) : false;

      if (shouldJoinToNext || (prevShouldJoinToNext && currentWordGroup)) {
        if (!currentWordGroup) {
          const group = document.createElement("span");
          group.classList.add("word-group");
          lineElem.appendChild(group);
          currentWordGroup = group;
        }

        currentWordGroup.appendChild(word);

        if (!shouldJoinToNext && prevShouldJoinToNext) {
          currentWordGroup = null;
        }
      } else {
        currentWordGroup = null;
        lineElem.appendChild(word);
      }
    });

    if (UnderLine) {
      const hasBackground = line.Background?.some((bg) => bg.Syllables.some(HasRenderableText)) ?? false;
      AppendSyllableRomanization(lineElem, line.Lead.Syllables, hasBackground);
    }

    const parentLineIndex = LyricsObject.Types.Syllable.Lines.length - 1;
    if (line.Background) {
      line.Background.forEach((bg) => {
        const lineE = document.createElement("div");
        lineE.classList.add("line", "bg-line");

        LyricsObject.Types.Syllable.Lines.push({
          HTMLElement: lineE,
          StartTime: ConvertTime(bg.StartTime),
          EndTime: ConvertTime(bg.EndTime),
          TotalTime: ConvertTime(bg.EndTime) - ConvertTime(bg.StartTime),
          BGLine: true,
          SpaceGravityParentLineIndex: parentLineIndex,
          ActivationStartTime: ConvertTime(line.Lead.StartTime),
          ActivationEndTime: ConvertTime(line.Lead.EndTime),
        });
        SetWordArrayInCurentLine();

        if (line.OppositeAligned) {
          lineE.classList.add("OppositeAligned");
        }
        lineElements.push(lineE);

        let currentBGWordGroup: HTMLSpanElement | null = null;

        const processedBGSyllables = renderableSyllables(bg.Syllables, ShowRomanized, allowLetterEmphasis);
        const bgPlans = planWords(processedBGSyllables, ShowRomanized, true, allowLetterEmphasis);
        processedBGSyllables.forEach((bw, bI, bA) => {
          let bwE = document.createElement("span");
          const isLastInLine = bI === bA.length - 1;
          const shouldJoinToNext = shouldJoinSyllableToNext(bw, isLastInLine, ShowRomanized);

          if (isRtl(bw.Text) && !lineE.classList.contains("rtl")) {
            lineE.classList.add("rtl");
          }

          const totalDuration = ConvertTime(bw.EndTime) - ConvertTime(bw.StartTime);

          const bwText = StripZeroWidth(getSyllableText(bw, ShowRomanized));
          const plan = bgPlans[bI];

          if (plan.Split) {
            bwE = document.createElement("div");
            Emphasize(plan.Letters, bwE, bw, true, pacedParts(bw, ShowRomanized, plan.Letters.length), plan.Group, bw.RestartRanges);
            tagWordLetters(plan.WordLetters);

            if (isLastInLine) {
              bwE.classList.add("LastWordInLine");
            } else if (shouldJoinToNext) {
              bwE.classList.add("PartOfWord");
            }

            if (usesSpringWordStyles()) {
              bwE.style.setProperty("--text-shadow-opacity", `0%`);
              bwE.style.setProperty("--text-shadow-blur-radius", `4px`);
              bwE.style.scale = getIdleEmphasisLyricsScale().toString();
              bwE.style.transform = `translateY(calc(var(--font-size) * 0.02))`;
            }
          } else {
            bwE.textContent = bwText;

            if (usesSpringWordStyles()) {
              bwE.style.setProperty("--gradient-position", `0%`);
              bwE.style.setProperty("--text-shadow-opacity", `0%`);
              bwE.style.setProperty("--text-shadow-blur-radius", `4px`);
              bwE.style.scale = getIdleLyricsScale().toString();
              bwE.style.transform = `translateY(calc(var(--font-size) * 0.01))`;
            }

            // Check if Syllables.Lead exists
            if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
              LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
                HTMLElement: bwE,
                StartTime: ConvertTime(bw.StartTime),
                EndTime: ConvertTime(bw.EndTime),
                TotalTime: ConvertTime(bw.EndTime) - ConvertTime(bw.StartTime),
                ...(bw.RestartRanges ? { RestartRanges: bw.RestartRanges.map((range) => ({
                  StartTime: ConvertTime(range.StartTime),
                  EndTime: ConvertTime(range.EndTime),
                })) } : {}),
                BGWord: true,
              });
              tagWordLetters(plan.WordLetters);
            } else {
              console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
            }

            bwE.classList.add("bg-word");
            bwE.classList.add("word");

            if (isLastInLine) {
              bwE.classList.add("LastWordInLine");
            } else if (shouldJoinToNext) {
              bwE.classList.add("PartOfWord");
            }
          }

          setSyllableTextVariants(bwE, bw, bwText);

          const prevBG = bA[bI - 1];
          const prevShouldJoinToNext = prevBG ? shouldJoinSyllableToNext(prevBG, false, ShowRomanized) : false;

          if (shouldJoinToNext || (prevShouldJoinToNext && currentBGWordGroup)) {
            if (!currentBGWordGroup) {
              const group = document.createElement("span");
              group.classList.add("word-group");
              lineE.appendChild(group);
              currentBGWordGroup = group;
            }

            currentBGWordGroup.appendChild(bwE);

            if (!shouldJoinToNext && prevShouldJoinToNext) {
              currentBGWordGroup = null;
            }
          } else {
            currentBGWordGroup = null;
            lineE.appendChild(bwE);
          }
        });

        if (UnderLine) AppendSyllableRomanization(lineE, bg.Syllables);
      });
    }
    const nextLine = arr[index + 1];
    if (nextLine && nextLine.Lead.StartTime - line.Lead.EndTime >= getLyricsBetweenShow()) {
      const musicalLine = document.createElement("div");
      musicalLine.classList.add("line");
      musicalLine.classList.add("musical-line");

      LyricsObject.Types.Syllable.Lines.push({
        HTMLElement: musicalLine,
        StartTime: ConvertTime(line.Lead.EndTime),
        EndTime: ConvertTime(nextLine.Lead.StartTime),
        TotalTime:
          ConvertTime(nextLine.Lead.StartTime) -
          ConvertTime(line.Lead.EndTime),
        DotLine: true,
      });

      SetWordArrayInCurentLine();

      if (nextLine.OppositeAligned) {
        musicalLine.classList.add("OppositeAligned");
      }

      const dotGroup = document.createElement("div");
      dotGroup.classList.add("dotGroup");

      const musicalDots1 = document.createElement("span");
      const musicalDots2 = document.createElement("span");
      const musicalDots3 = document.createElement("span");

      const gapStartTime = ConvertTime(line.Lead.EndTime);
      const totalTime = ConvertTime(nextLine.Lead.StartTime) - gapStartTime;
      const baseDotTime = totalTime / 3;
      const dotPadding = getInterludeTimePadding() / 3;
      const dot1EndTime = Math.max(gapStartTime, gapStartTime + baseDotTime + dotPadding);
      const dot2EndTime = Math.max(dot1EndTime, gapStartTime + baseDotTime * 2 + dotPadding * 2);
      const dot3EndTime = Math.max(dot2EndTime, gapStartTime + totalTime + getInterludeTimePadding());

      musicalDots1.classList.add("word");
      musicalDots1.classList.add("dot");
      musicalDots1.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots1,
          StartTime: gapStartTime,
          EndTime: dot1EndTime,
          TotalTime: dot1EndTime - gapStartTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
      }

      musicalDots2.classList.add("word");
      musicalDots2.classList.add("dot");
      musicalDots2.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots2,
          StartTime: dot1EndTime,
          EndTime: dot2EndTime,
          TotalTime: dot2EndTime - dot1EndTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
      }

      musicalDots3.classList.add("word");
      musicalDots3.classList.add("dot");
      musicalDots3.textContent = "•";

      // Check if Syllables.Lead exists
      if (LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables?.Lead.push({
          HTMLElement: musicalDots3,
          StartTime: dot2EndTime,
          EndTime: dot3EndTime,
          TotalTime: dot3EndTime - dot2EndTime,
          Dot: true,
        });
      } else {
        console.warn("Syllables.Lead is undefined for CurrentLineLyricsObject");
      }

      dotGroup.appendChild(musicalDots1);
      dotGroup.appendChild(musicalDots2);
      dotGroup.appendChild(musicalDots3);

      musicalLine.appendChild(dotGroup);
      lineElements.push(musicalLine);
    }
  });

  const footer = CreateLyricsFooter(LyricsContainer, LyricsContainerParent, spaceGravityMode);

  ApplyLyricsCredits(data, footer);
  ApplyLyricsProvider(data, footer);
  ApplyExperimentalWordSyncNotice(data, footer);
  ApplyIsByCommunity(data, footer);

  if (LyricsContainerParent) {
    LyricsContainerInstance.Append(LyricsContainerParent);
  }

  if (spaceGravityMode) LyricsContainer.classList.add("SpaceGravityStage");

  const LyricsStylingContainer = spaceGravityMode
    ? LyricsContainer
    : PageContainer?.querySelector<HTMLElement>(
        ".LyricsContainer .LyricsContent .simplebar-content"
      );

  // Check if LyricsStylingContainer exists
  if (LyricsStylingContainer) {
    removeAllStyles(LyricsStylingContainer);

    if (data.classes && !spaceGravityMode) {
      LyricsStylingContainer.className = data.classes;
    } else if (data.classes) {
      LyricsStylingContainer.classList.add(...data.classes.split(/\s+/).filter(Boolean));
    }

    if (data.styles) {
      applyStyles(LyricsStylingContainer, data.styles);
    }
  } else {
    console.warn("LyricsStylingContainer not found");
  }

  if (spaceGravityMode) {
    mountSpaceGravity(
      virtualContainer,
      LyricsObject.Types.Syllable.Lines,
      LyricsContainer,
      footer
    );
  } else {
    if (ScrollSimplebar) RecalculateScrollSimplebar();
    else MountScrollSimplebar();

    const scrollEl = ScrollSimplebar?.getScrollElement() as HTMLElement | undefined;
    if (scrollEl) initLyricsVirtualizer(scrollEl, virtualContainer, lineElements, viewportAnchor);
  }

  syllableRenderSession = {
    Host: LyricsContainerParent!,
    Container: LyricsContainer,
    VirtualContainer: virtualContainer,
    Lines: LyricsObject.Types.Syllable.Lines,
    LineElements: lineElements,
    Footer: footer,
    SpaceGravity: spaceGravityMode,
  };

  EmitApply(data.Type, data.Content);

  if (viewportAnchor) AdoptReappliedScrollPosition();
  else if (!spaceGravityMode) PositionInitialLyrics(ScrollSimplebar);

  if (enableSpaceGravityAfterMount) {
    const renderWindow = LyricsContainer.ownerDocument.defaultView ?? window;
    renderWindow.requestAnimationFrame(() => renderWindow.requestAnimationFrame(() => {
      if (!$spaceGravityMode.get() || syllableRenderSession?.Container !== LyricsContainer) return;
      UpdateRenderedSpaceGravity(true);
    }));
  }

  setRomanizedStatus(UseRomanized);
}
