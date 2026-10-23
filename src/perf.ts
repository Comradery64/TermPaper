import { invoke } from "@tauri-apps/api/core";

/** Startup stage timestamps (ms since the page began loading). `window.__perf` in the console; with
 *  TERMPAPER_PERF=1 set when launching, the app also writes them to startup.log in its config dir. */
const marks: Record<string, number> = {};
(window as any).__perf = marks;

export function mark(name: string) {
  if (!(name in marks)) marks[name] = Math.round(performance.now());
}

export function reportPerf() {
  const text = Object.entries(marks).map(([k, v]) => `${k}=${v}`).join(" ");
  console.info("[perf]", text);
  invoke("perf_log", { text }).catch(() => { /* plain browser */ });
}
