import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fontsFor } from "../../../../utils/fontPicker.ts";
import { loadCoollabsFontPreview } from "../../../../utils/coollabsFonts.ts";
import { CancelSpecimen, GetSpecimen, PeekSpecimen, SpecimensAvailable, TrimSpecimens, type Specimen } from "../../../../utils/fontSpecimens.ts";

type Source = "google" | "system";

// Rows have a fixed height so only the ones in view are rendered. An installed font
// list can run to several hundred families, and drawing each in its own face is what
// made the old grid slow to scroll.
const ROW_HEIGHT = 34;
const OVERSCAN = 6;
const LIST_MAX_HEIGHT = 340;
const SHEET_WIDTH = 300;
const EDGE = 8;
const GAP = 6;

const fontCache = new Map<Source, Promise<string[]>>();
const loadFonts = (source: Source) => {
  let fonts = fontCache.get(source);
  if (!fonts) {
    fonts = fontsFor(source);
    fontCache.set(source, fonts);
  }
  return fonts;
};

// Each name is a picture of itself drawn in its font off the page (fontSpecimens.ts): loading
// a font into the page restyled all of Spotify, once per font, while the list scrolled. Rows
// show the plain name and a spinner until theirs arrives, asked for once scrolling pauses.
const SPECIMEN_SETTLE_MS = 90;
const SPECIMENS_KEPT_CLOSED = 40;
// Room for the name: the sheet less its padding, the row's padding and the check column.
const NAME_MAX_WIDTH = SHEET_WIDTH - 12 - 18 - 12 - 8;

/** A specimen drawn into a canvas, so the row keeps the picture without copying it. */
function SpecimenImage({ specimen }: { specimen: Specimen }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = specimen.bitmap.width;
    canvas.height = specimen.bitmap.height;
    try {
      canvas.getContext("2d")?.drawImage(specimen.bitmap, 0, 0);
    } catch {
      // Released from the cache meanwhile; the row asks again when it next comes into view.
    }
  }, [specimen]);
  return <canvas ref={ref} className="sl-us-font-specimen" aria-hidden="true" style={{ width: specimen.width, height: specimen.height }} />;
}

const faceFor = (font: string) => `"${font.replace(/"/g, '\\"')}", var(--encore-body-font-stack, sans-serif)`;

/**
 * A font chooser shaped like the panel's Select: a button showing the chosen font in its
 * own face, opening a sheet with a search field and every font drawn in itself.
 */
export function FontPicker({ source, value, onChange, disabled, label }: {
  source: Source;
  value: string;
  onChange: (font: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [, setSpecimenTick] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = `sl-us-fontlist-${source}`;
  const placeholder = source === "google" ? "Choose Google Font" : "Choose System Font";

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (fonts ?? []).filter((font) => !needle || font.toLowerCase().includes(needle));
  }, [fonts, query]);

  // The button shows the chosen Google family in its own face.
  useEffect(() => {
    if (source === "google" && value) loadCoollabsFontPreview(value, triggerRef.current?.ownerDocument ?? document);
  }, [source, value]);

  // Closed, the picker keeps only a screenful or two of images, ready for the next open.
  useEffect(() => {
    if (open) return;
    TrimSpecimens(SPECIMENS_KEPT_CLOSED);
  }, [open]);

  // The list is fetched while the panel is idle, so the sheet opens without waiting on it.
  useEffect(() => {
    if (disabled) return;
    const view = (triggerRef.current?.ownerDocument.defaultView ?? window) as Window;
    const idle = view.requestIdleCallback?.(() => void loadFonts(source), { timeout: 2000 });
    return () => { if (idle !== undefined) view.cancelIdleCallback?.(idle); };
  }, [disabled, source]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadFonts(source).then((list) => { if (!cancelled) setFonts(list); });
    return () => { cancelled = true; };
  }, [open, source]);

  const scrollToRow = (index: number, align: "nearest" | "center") => {
    const list = listRef.current;
    if (!list) return;
    const top = index * ROW_HEIGHT;
    if (align === "center") list.scrollTop = Math.max(0, top - (list.clientHeight - ROW_HEIGHT) / 2);
    else if (top < list.scrollTop) list.scrollTop = top;
    else if (top + ROW_HEIGHT > list.scrollTop + list.clientHeight) list.scrollTop = top + ROW_HEIGHT - list.clientHeight;
    setScrollTop(list.scrollTop);
  };

  const place = () => {
    const trigger = triggerRef.current;
    const sheet = sheetRef.current;
    if (!trigger || !sheet) return;
    const view = trigger.ownerDocument.defaultView ?? window;
    const box = trigger.getBoundingClientRect();
    const height = sheet.offsetHeight;
    const roomBelow = view.innerHeight - box.bottom - GAP - EDGE;
    const roomAbove = box.top - GAP - EDGE;
    const above = height > roomBelow && roomAbove > roomBelow;
    sheet.dataset.placement = above ? "above" : "below";
    sheet.style.left = `${Math.min(Math.max(EDGE, box.right - SHEET_WIDTH), view.innerWidth - SHEET_WIDTH - EDGE)}px`;
    sheet.style.top = above ? `${Math.max(EDGE, box.top - GAP - height)}px` : `${box.bottom + GAP}px`;
  };

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (open) {
      if (!sheet.matches(":popover-open")) sheet.showPopover();
      place();
      searchRef.current?.focus({ preventScroll: true });
    } else if (sheet.matches(":popover-open")) {
      sheet.hidePopover();
    }
  }, [open]);

  // Opening lands on the chosen font; a new search starts from the top.
  // Runs after showPopover() so list.clientHeight and scrollTop are live.
  useLayoutEffect(() => {
    if (!open || !fonts) return;
    if (query) {
      setActive(0);
      scrollToRow(0, "nearest");
      return;
    }
    const at = Math.max(0, fonts.indexOf(value));
    setActive(at);
    scrollToRow(at, "center");
  }, [open, fonts, query]);

  // The sheet's height settles once the fonts arrive.
  useLayoutEffect(() => { if (open) place(); }, [open, matches.length]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  // Closes like the panel's Select: on a press outside, the settings pane scrolling
  // under it, a resize, or the window losing focus. Escape closes only the sheet.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    const doc = trigger.ownerDocument;
    const view = doc.defaultView ?? window;
    const close = () => setOpen(false);
    const onPress = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.contains(target) && !sheetRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      if ((event.target as Node).contains?.(trigger)) close();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      trigger.focus();
    };
    view.addEventListener("keydown", onEscape, true);
    doc.addEventListener("pointerdown", onPress, true);
    doc.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", close);
    view.addEventListener("blur", close);
    return () => {
      view.removeEventListener("keydown", onEscape, true);
      doc.removeEventListener("pointerdown", onPress, true);
      doc.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", close);
      view.removeEventListener("blur", close);
    };
  }, [open]);

  const commit = (font: string | undefined) => {
    if (!font) return;
    setOpen(false);
    setQuery("");
    if (font !== value) onChange(font);
    triggerRef.current?.focus();
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const last = matches.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      const next = Math.min(Math.max(0, to), Math.max(0, last));
      setActive(next);
      scrollToRow(next, "nearest");
    };
    const page = Math.max(1, Math.floor(LIST_MAX_HEIGHT / ROW_HEIGHT) - 1);
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "PageDown") move(active + page);
    else if (event.key === "PageUp") move(active - page);
    else if (event.key === "Enter") {
      event.preventDefault();
      commit(matches[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
    // Spotify's own shortcuts listen on the document; typing here is for the search.
    event.stopPropagation();
  };

  const viewHeight = Math.min(LIST_MAX_HEIGHT, Math.max(matches.length, 1) * ROW_HEIGHT);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(matches.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN);

  // Specimens asked for and not yet arrived. One whose row has left the view is called off.
  const requestedRef = useRef(new Set<string>());
  // Arrivals are shown together, at most once a frame, whichever pass asked for them.
  const arrivalFrameRef = useRef(0);
  const showArrivals = () => {
    if (arrivalFrameRef.current) return;
    const view = triggerRef.current?.ownerDocument.defaultView ?? window;
    arrivalFrameRef.current = view.requestAnimationFrame(() => {
      arrivalFrameRef.current = 0;
      setSpecimenTick((tick) => tick + 1);
    });
  };
  useEffect(() => {
    const requested = requestedRef.current;
    const inView = open ? new Set(matches.slice(first, last)) : new Set<string>();
    for (const font of requested) {
      if (inView.has(font) && PeekSpecimen(font, source, NAME_MAX_WIDTH) === undefined) continue;
      if (!inView.has(font)) CancelSpecimen(font, source, NAME_MAX_WIDTH);
      requested.delete(font);
    }
    if (!open || !SpecimensAvailable()) return;
    const wanted = [...inView].filter((font) => !requested.has(font) && PeekSpecimen(font, source, NAME_MAX_WIDTH) === undefined);
    if (wanted.length === 0) return;
    const view = triggerRef.current?.ownerDocument.defaultView ?? window;
    const settle = view.setTimeout(() => {
      for (const font of wanted) {
        requested.add(font);
        void GetSpecimen(font, source, NAME_MAX_WIDTH).then(showArrivals);
      }
    }, SPECIMEN_SETTLE_MS);
    return () => view.clearTimeout(settle);
  }, [open, first, last, matches, source]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sl-us-select sl-us-font-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <span className="sl-us-font-trigger-value" style={value ? { fontFamily: faceFor(value) } : undefined}>
          {value || placeholder}
        </span>
        <svg className="sl-us-select-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div ref={sheetRef} className="sl-us-font-sheet" popover="manual" style={{ width: SHEET_WIDTH }}>
        <div className="sl-us-search-wrap sl-us-font-search">
          <svg className="sl-us-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            className="sl-us-search"
            type="search"
            role="combobox"
            aria-label={`Search ${source === "google" ? "Google Fonts" : "installed fonts"}`}
            aria-controls={listId}
            aria-expanded={open}
            aria-activedescendant={matches.length ? `${listId}-${active}` : undefined}
            placeholder={source === "google" ? "Search Google Fonts" : "Search installed fonts"}
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>
        <div
          ref={listRef}
          id={listId}
          className="sl-us-font-list"
          role="listbox"
          aria-label={label}
          style={{ height: viewHeight }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          // Keeps focus in the search field while a font is pressed.
          onMouseDown={(event) => event.preventDefault()}
        >
          {fonts === null ? (
            <div className="sl-us-font-empty">Loading fonts…</div>
          ) : matches.length === 0 ? (
            <div className="sl-us-font-empty">No matching fonts</div>
          ) : (
            <div style={{ height: matches.length * ROW_HEIGHT, position: "relative" }}>
              {matches.slice(first, last).map((font, offset) => {
                const i = first + offset;
                const specimen = PeekSpecimen(font, source, NAME_MAX_WIDTH);
                const loading = specimen === undefined && SpecimensAvailable();
                return (
                  <div
                    key={font}
                    id={`${listId}-${i}`}
                    role="option"
                    className="sl-us-option sl-us-font-option"
                    aria-selected={font === value}
                    aria-busy={loading || undefined}
                    data-active={i === active || undefined}
                    title={font}
                    style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                    onPointerMove={() => active !== i && setActive(i)}
                    onClick={() => commit(font)}
                  >
                    {specimen ? (
                      <span className="sl-us-font-name">
                        <SpecimenImage specimen={specimen} />
                        <span className="sl-us-font-label">{font}</span>
                      </span>
                    ) : (
                      <span className="sl-us-font-name">{font}</span>
                    )}
                    {loading ? (
                      <span className="sl-us-font-spinner" aria-hidden="true" />
                    ) : (
                      <svg className="sl-us-option-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
