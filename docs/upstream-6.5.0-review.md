# Upstream 6.5.0 integration review

This branch (`sync-upstream`) merges upstream `Spikerko/spicy-lyrics` `main` at `75914be` (6.5.0) into the fork at `a60aa34` (`dev`, 100.10.54). The merge base is `ebcb1f0`. The application version stays `100.10.54`.

The merge keeps the fork's providers and source ordering, animator presets, Simple Lyrics Mode, Space Gravity, local TTML parser, experimental word sync, pinned footer, settings panel, release year display, background modes, volume controls, Cinema and Picture-in-Picture. Version switching and the channel loader are unchanged: `builds/main/entrypoint.mjs` is the fork's own, and switching is left to the external builds loader.

## Added from upstream

- Bloom renderer style (Settings > Effects > Renderer Visual Style), with its timed scroll, background vocal pop-out and larger Cinema lyrics.
- Queue view with the Lyrics / Queue switch, Up Next card, grouped view controls, Player Below the Cover, portrait fullscreen.
- Motion artwork (animated album covers) and the music-reactive dynamic background.
- Romanization rewrite: Japanese, Korean and Chinese line-at-a-time romanization, "Romaji as Written", and romanization shown under each line (Lyrics Display > Romanization).
- Join Split Words modes (Off / All / Steadily Sung / Held) and Keep Syllable Pace. The fork's previous toggle had no effect on syllable lyrics, since its reducer was fixed to "Default".
- Per-song playback offset, Lyrics Size, Auto-scroll Unsynced Lyrics.
- TTML Reviewer mode and Bug Report, as rows in Settings > Advanced that open their own panes.
- Experiment categories, the scroll target rules that keep background vocals from dragging the view back, and the TTML fixes listed below.

## Integration choices

- **Bloom and Simple Lyrics Mode.** Bloom is the style upstream grew out of its Refreshed Simple Lyrics look, so the fork's "Simple Lyrics Mode + Refreshed Simple Lyrics" now renders with Bloom (`isBloomRenderer()` covers both). Plain Simple Lyrics Mode (Calculate / Animate) and the animator presets are unchanged and apply to Spring only. Upstream's migration that turned `simpleLyricsMode` into `rendererVisualStyle` and deleted the old key is not applied, and the `refreshedSimpleLyrics` experiment upstream removed is kept. Space Gravity turns Bloom off while it is on.
- **Release year.** The fork's display, settings values (`Off` / `Left` / `Right`) and reveal timing are kept. The lookup now uses `releaseYear.ts`: one GraphQL track request with shared in-flight requests and a bounded cache, and an iTunes Search fallback for local files and tracks with no date. Upstream's own year renderer is not used.
- **Pinned credits.** The fork's pinned footer is kept and upstream's Pinned Credits is not. The footer publishes `HasPinnedCredits` and `--SL-PinnedCreditsHeight` on `.LyricsContainer`, so Up Next clears it.
- **Scroll to active line.** The fork's button and setting are kept. Line choice uses `ScrollTarget.ts`. The button takes the seat in the Lyrics / Queue switch where that switch is shown, and shows for unsynced lyrics while they auto-scroll.
- **NowBar marquee.** The fork's CSS marquee is kept for the song name and artists; upstream's `TextScroller` still drives the Up Next and Queue rows.
- **Settings panel.** Upstream's declarative panel is not used. New settings are rows in the fork's sections and are registered in `hiddenSettings.ts`. TTML Reviewer's profile is adapted to the fork's settings (Simple Lyrics Mode, animator preset, Space Gravity, word filters, experimental word sync, custom font, the fork's background keys).
- **TTML parsing.** The fork's DOM parser is kept, with these fixes applied: `&nbsp;` no longer fails the document, syllables with no end or an end before their begin get a length, a line ending before it begins ends where it begins, and romanized word breaks are read from the spacing between transliteration spans (`TransliteratedIsPartOfWord`).
- **Lyrics pipeline.** Upstream's `ProcessLyrics` rewrite is used, with the fork's legacy-field normalization, comma spacing and word filters. Fetching keeps the fork's provider flow and adds: answered-from tracking for the bug report, "Just once" uploads kept through setting rebuilds and re-romanized when the Japanese spelling changes, cached lyrics in the other spelling refetched, partially romanized lyrics left uncached, and ads skipped.
- **Dynamic background.** The music-reactive clock is stepped from the fork's per-window render loops, so a popout keeps it running while Spotify's window is hidden.
- **Fullscreen.** Compact mode is not dropped on close: in the fork it also exists outside fullscreen with the NowBar open.
- **Update dialog.** The fork's dialog (downgrade and walkthrough handling) is kept, with upstream's once-per-version guard.

## Verification

- `tsc --noEmit` reports the same 41 errors as `dev` before the merge, none new.
- `node project/build.mjs -test` builds with no warnings.
- `oxlint` reports no errors.
- The ported TTML parser was run under Bun with linkedom on a sample covering romanized word breaks, `&nbsp;`, missing and reversed ends.

Nothing was run inside Spotify: the debugger port was not available, so every rendering and interaction change is unreviewed visually.

## Manual review

- Spring with each animator preset, Simple Lyrics Mode (Calculate, Animate, Refreshed), Bloom, and Space Gravity on top of each. Switch between them while a song plays.
- Join Split Words in each mode with Keep Syllable Pace on and off, with romanization replaced and under each line, and with word filters.
- Romanization under each line in syllable, line and static lyrics; toggle romanization with lyrics loaded.
- Per-song offset, Lyrics Size, unsynced auto-scroll (Basic, Advanced) with a hand scroll and the scroll button.
- Queue view, Up Next with the pinned footer in each mode, grouped view controls with the scroll button seated, Player Below the Cover, portrait fullscreen, popup dock.
- Motion artwork on the NowBar and Canvas Stage; the music-reactive background in the page, Cinema and a hidden-window popout.
- TTML Reviewer on and off (settings restored), Bug Report copy and preview.
- Release year for catalogue tracks, same-album skips, local files, episodes and DJ.
- Settings panel search and hidden settings for every new row.
