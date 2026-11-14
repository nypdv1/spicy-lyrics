import { PopupModal } from "../components/Modal.ts";
import { GOOGLE_FONT_OPTIONS } from "./googleFonts.ts";

const SYSTEM_FONT_FALLBACK = ["Arial", "Calibri", "Cambria", "Cascadia Mono", "Courier New", "Georgia", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"];

type LocalFont = { family: string };

async function fontsFor(source: "google" | "system"): Promise<string[]> {
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
  PopupModal.display({ title: source === "google" ? "Choose a Google Font" : "Choose a System Font", content: root, modalId: "fontPicker", isLarge: true });

  void fontsFor(source).then((fonts) => {
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const matches = fonts.filter((font) => !query || font.toLowerCase().includes(query));
      list.replaceChildren(...matches.map((font) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `sl-font-picker-option${font === selected ? " is-selected" : ""}`;
        button.style.fontFamily = `"${font.replace(/"/g, "\\\"")}"`;
        button.innerHTML = `<strong>${font}</strong><span>The quick brown fox jumps over the lazy dog</span>`;
        button.onclick = () => { onSelect(font); PopupModal.hide(); };
        return button;
      }));
      if (!matches.length) list.textContent = "No matching fonts.";
    };
    search.addEventListener("input", render);
    render();
    search.focus();
  });
}
