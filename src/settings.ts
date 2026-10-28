/**
 * Settings card (Cmd/Ctrl+,). Edits `prefs` in place, saves, and tells main.ts what changed.
 */
import { PRESETS, ROLES, prefs, savePrefs, type LineNumbers, type PanelSide } from "./prefs";
import { pageTurn } from "./pageturn";
import { overlayScrollbar } from "./scrollbar";

export interface FontChoice { key: string; family: string; label: string }
export type Changed = "font" | "fontSize" | "lineNumbers" | "highlight" | "colors";

export function openSettings(fonts: FontChoice[], onChange: (what: Changed) => void, onClose: () => void) {
  if (document.getElementById("settings")) return;
  const back = document.createElement("div");
  back.id = "settings";
  // right: the page turns over to show the card on its back; left/bottom: the card slides in
  const turning = prefs.panelSide === "right";
  back.className = turning ? "right turn" : prefs.panelSide;
  back.innerHTML = `
    <div class="card" role="dialog" aria-label="Settings"><div class="scroll">
      <h2>Settings</h2>
      <h3>Font</h3>
      <div class="fonts"></div>
      <label class="check"><input type="checkbox" data-k="handwriting"> Handwriting <small>(the pen writes each letter you type)</small></label>
      <h3>Size</h3>
      <div class="size"><button data-d="-1">−</button><span></span><button data-d="1">+</button></div>
      <h3>Line numbers</h3>
      <div class="seg lines">
        <button data-v="rows">Every row</button><button data-v="commands">Each command</button><button data-v="off">Off</button>
      </div>
      <h3>Syntax highlighting</h3>
      <label class="check"><input type="checkbox" data-k="hlOutput"> Command output</label>
      <label class="check"><input type="checkbox" data-k="hlInput"> Typed commands <small>(colors what you type)</small></label>
      <h3>Panel opens from</h3>
      <div class="seg side">
        <button data-v="right">Right</button><button data-v="left">Left</button><button data-v="bottom">Bottom</button>
      </div>
      <h3>Ink</h3>
      <div class="seg presets"></div>
      <div class="colors"></div>
      <p class="hint">Esc to close · colors apply to new text</p>
    </div></div>`;
  const $ = <T extends Element>(q: string) => back.querySelector<T>(q)!;
  const changed = (what: Changed) => { savePrefs(); onChange(what); render(); };

  for (const f of fonts) {
    const b = document.createElement("button");
    b.dataset.key = f.key;
    b.innerHTML = `<span class="name"></span><span class="sample">The quick brown fox · 0Oo 1lI {}#</span>`;
    b.querySelector(".name")!.textContent = f.label;
    (b.querySelector(".sample") as HTMLElement).style.fontFamily = `"${f.family}", monospace`;
    b.onclick = () => { prefs.font = f.key; changed("font"); };
    $(".fonts").appendChild(b);
  }
  back.querySelectorAll<HTMLButtonElement>(".size button").forEach((b) => {
    b.onclick = () => { prefs.fontSize = Math.min(32, Math.max(9, prefs.fontSize + Number(b.dataset.d))); changed("fontSize"); };
  });
  back.querySelectorAll<HTMLButtonElement>(".lines button").forEach((b) => {
    b.onclick = () => { prefs.lineNumbers = b.dataset.v as LineNumbers; changed("lineNumbers"); };
  });
  back.querySelectorAll<HTMLButtonElement>(".side button").forEach((b) => {
    b.onclick = () => { prefs.panelSide = b.dataset.v as PanelSide; savePrefs(); render(); };   // applies next open
  });
  back.querySelectorAll<HTMLInputElement>(".check input").forEach((c) => {
    c.onchange = () => { (prefs as any)[c.dataset.k!] = c.checked; changed("highlight"); };
  });
  for (const [key, p] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.dataset.v = key; b.textContent = p.label;
    b.onclick = () => { prefs.preset = key; prefs.colors = { ...p.colors }; changed("colors"); };
    $(".presets").appendChild(b);
  }
  for (const [role, label] of ROLES) {
    const l = document.createElement("label");
    l.innerHTML = `<input type="color" data-role="${role}"><span></span>`;
    l.querySelector("span")!.textContent = label;
    const input = l.querySelector("input")!;
    input.oninput = () => { prefs.colors[role] = input.value; changed("colors"); };
    $(".colors").appendChild(l);
  }

  function render() {
    back.querySelectorAll<HTMLButtonElement>(".fonts button").forEach((b) => b.classList.toggle("on", b.dataset.key === prefs.font));
    $(".size span").textContent = `${prefs.fontSize}px`;
    back.querySelectorAll<HTMLButtonElement>(".lines button").forEach((b) => b.classList.toggle("on", b.dataset.v === prefs.lineNumbers));
    back.querySelectorAll<HTMLButtonElement>(".side button").forEach((b) => b.classList.toggle("on", b.dataset.v === prefs.panelSide));
    back.querySelectorAll<HTMLInputElement>(".check input").forEach((c) => (c.checked = (prefs as any)[c.dataset.k!]));
    // a preset stays lit only while its colors are unedited
    const same = (k: string) => Object.entries(PRESETS[k].colors).every(([r, v]) => (prefs.colors as any)[r] === v);
    back.querySelectorAll<HTMLButtonElement>(".presets button").forEach((b) => b.classList.toggle("on", same(b.dataset.v!)));
    back.querySelectorAll<HTMLInputElement>(".colors input").forEach((i) => (i.value = (prefs.colors as any)[i.dataset.role!]));
    back.querySelectorAll<HTMLElement>(".fonts .sample").forEach((s) => (s.style.color = prefs.colors.ink));
  }

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey, true);
    if (turn) await turn.close();
    back.remove(); onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === ",")) { e.preventDefault(); e.stopPropagation(); close(); }
  };
  back.onclick = (e) => { if (!(e.target as Element).closest(".card")) close(); };
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(back);
  const card = $<HTMLElement>(".card");
  const turn = turning ? pageTurn(back, card) : null;
  overlayScrollbar(card, () => card.querySelector<HTMLElement>(".scroll"), false);
  render();
  turn?.open();
  back.querySelector<HTMLElement>(".fonts button.on")?.focus();
}
