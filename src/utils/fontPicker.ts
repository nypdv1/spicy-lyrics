import { PopupModal } from "../components/Modal.ts";
import { GOOGLE_FONT_OPTIONS } from "./googleFonts.ts";
import { loadCoollabsFontPreview } from "./coollabsFonts.ts";

const SYSTEM_FONT_FALLBACK = ["Arial", "Calibri", "Cambria", "Cascadia Mono", "Courier New", "Georgia", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"];

type LocalFont = { family: string };

export async function fontsFor(source: "google" | "system"): Promise<string[]> {
  if (source === "google") return [...GOOGLE_FONT_OPTIONS];
  const queryLocalFonts = (window as Window & { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts;
  if (!queryLocalFonts) return SYSTEM_FONT_FALLBACK;
  try {
    return [...new Set((await queryLocalFonts()).map((font) => font.family).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  } catch {
    return SYSTEM_FONT_FALLBACK;
  }
}

export function openFontPicker(source: "google" | "system", selected: string, onSelect: (font: string) => void): void {
  const root = document.createElement("div");
  root.className = "sl-font-picker";
  const search = document.createElement("input");
  search.className = "sl-font-picker-search";
  search.placeholder = source === "google" ? "Search Google Fonts" : "Search installed fonts";
  const list = document.createElement("div");
  list.className = "sl-font-picker-list";
  root.append(search, list);
  let closed = false;
  let removePreviews = () => {};
  PopupModal.display({ title: source === "google" ? "Choose a Google Font" : "Choose a System Font", content: root, modalId: "fontPicker", isLarge: true, onClose: () => { closed = true; removePreviews(); } });

  void fontsFor(source).then((fonts) => {
    if (closed) return;
    // Each Google specimen loads as its card scrolls into view; there are too many to load at once.
    const observer = source === "google"
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const font = (entry.target as HTMLElement).dataset.font;
            if (font) loadCoollabsFontPreview(font);
            observer?.unobserve(entry.target);
          }
        }, { root: list, rootMargin: "300px 0px" })
      : null;
    removePreviews = () => observer?.disconnect();
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const matches = fonts.filter((font) => !query || font.toLowerCase().includes(query));
      observer?.disconnect();
      list.replaceChildren(...matches.map((font) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `sl-font-picker-option${font === selected ? " is-selected" : ""}`;
        button.style.fontFamily = `"${font.replace(/"/g, "\\\"")}"`;
        button.dataset.font = font;
        const name = document.createElement("strong");
        name.textContent = font;
        const sample = document.createElement("span");
        sample.textContent = "The quick brown fox jumps over the lazy dog";
        button.append(name, sample);
        button.onclick = () => { onSelect(font); PopupModal.hide(); };
        observer?.observe(button);
        return button;
      }));
      if (!matches.length) list.textContent = "No matching fonts.";
    };
    search.addEventListener("input", render);
    render();
    search.focus();
  });
}
