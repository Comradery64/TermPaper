/**
 * User preferences: one JSON blob, saved to a file in the app's config dir
 * (~/Library/Application Support/<identifier>/prefs.json) so they survive restarts,
 * dev-server port changes and dev/release switches. localStorage is tied to the page's
 * origin, so it is only a fallback (plain-browser demo). Ink themes are presets the
 * user can edit per color.
 */
import { invoke } from "@tauri-apps/api/core";

export const ROLES = [
  ["ink", "Typed text"], ["graphite", "System text"], ["lineNumber", "Line numbers"],
  ["command", "Command"], ["flag", "Flag"], ["string", "String"], ["number", "Number"],
  ["path", "Path / URL"], ["variable", "Variable"], ["operator", "Operator"],
  ["error", "Error"], ["warning", "Warning"], ["success", "Success"],
] as const;
export type Role = (typeof ROLES)[number][0];
export type Colors = Record<Role, string>;

export const PRESETS: Record<string, { label: string; colors: Colors }> = {
  fountain: { label: "Fountain pen", colors: {
    ink: "#0e1e80", graphite: "#24262e", lineNumber: "#a3a8b4",
    command: "#0b3a8c", flag: "#7b3f8c", string: "#2e7d32", number: "#9a5a00",
    path: "#0e6e7c", variable: "#8e3f9e", operator: "#6b6f7b",
    error: "#b3261e", warning: "#946f00", success: "#1b7f3b" } },
  ballpoint: { label: "Ballpoint", colors: {     // three pens: blue, black, red
    ink: "#1f3fbf", graphite: "#1a1a1a", lineNumber: "#a0a0a0",
    command: "#1f3fbf", flag: "#4a4a4a", string: "#c62828", number: "#1f3fbf",
    path: "#1a1a1a", variable: "#c62828", operator: "#777777",
    error: "#c62828", warning: "#c62828", success: "#1f3fbf" } },
  pencil: { label: "Pencil", colors: {
    ink: "#3a3d47", graphite: "#2a2c33", lineNumber: "#b0b3ba",
    command: "#1e2026", flag: "#5a5e6a", string: "#4a4d57", number: "#4a4d57",
    path: "#3a3d47", variable: "#5a5e6a", operator: "#8a8d96",
    error: "#7a2a24", warning: "#6b5a2a", success: "#3d5a3d" } },
  highlighters: { label: "Felt tips", colors: {
    ink: "#0e1e80", graphite: "#24262e", lineNumber: "#d58bb4",
    command: "#c2185b", flag: "#6a1b9a", string: "#2e7d32", number: "#e65100",
    path: "#00838f", variable: "#6a1b9a", operator: "#757575",
    error: "#d50000", warning: "#ef6c00", success: "#2e7d32" } },
};

export type LineNumbers = "rows" | "commands" | "off";
export type PanelSide = "right" | "left" | "bottom";
export const prefs = {
  font: "radon",           // defaults are the owner's tuned setup
  fontSize: 17,
  lineNumbers: "off" as LineNumbers,
  hlOutput: true,
  hlInput: false,
  panelSide: "right" as PanelSide,
  preset: "fountain",
  colors: { ...PRESETS.fountain.colors } as Colors,
};

try {
  const saved = await invoke<string | null>("load_prefs").catch(() => null) ?? localStorage.getItem("prefs");
  Object.assign(prefs, JSON.parse(saved ?? "{}"));
  // keys from before the prefs blob
  prefs.font = localStorage.getItem("font") ?? prefs.font;
  prefs.fontSize = Number(localStorage.getItem("fontSize")) || prefs.fontSize;
  localStorage.removeItem("font"); localStorage.removeItem("fontSize");
  prefs.colors = { ...PRESETS.fountain.colors, ...prefs.colors };   // roles added later get defaults
} catch (e) { console.warn("prefs", e); }

export function savePrefs() {
  const json = JSON.stringify(prefs);
  localStorage.setItem("prefs", json);
  invoke("save_prefs", { json }).catch(() => { /* plain browser: localStorage only */ });
}

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
