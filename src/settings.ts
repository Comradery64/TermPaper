/**
 * Settings card (Cmd/Ctrl+,): font and size. Each font is previewed in itself.
 * Choices persist in localStorage; main.ts applies them through the callbacks.
 */
export interface FontChoice { key: string; family: string; label: string }

export function openSettings(opts: {
  fonts: FontChoice[];
  current: () => { font: string; size: number };
  setFont: (key: string) => void;
  setSize: (size: number) => void;
  onClose: () => void;
}) {
  if (document.getElementById("settings")) return;
  const back = document.createElement("div");
  back.id = "settings";
  back.innerHTML = `
    <div class="card" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <h3>Font</h3>
      <div class="fonts"></div>
      <h3>Size</h3>
      <div class="size"><button data-d="-1">−</button><span></span><button data-d="1">+</button></div>
      <p class="hint">Esc to close</p>
    </div>`;
  const list = back.querySelector(".fonts")!;
  const sizeLabel = back.querySelector(".size span")!;
  const render = () => {
    const { font, size } = opts.current();
    list.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.key === font));
    sizeLabel.textContent = `${size}px`;
  };
  for (const f of opts.fonts) {
    const b = document.createElement("button");
    b.dataset.key = f.key;
    b.innerHTML = `<span class="name"></span><span class="sample">The quick brown fox · 0Oo 1lI {}#</span>`;
    b.querySelector(".name")!.textContent = f.label;
    (b.querySelector(".sample") as HTMLElement).style.fontFamily = `"${f.family}", monospace`;
    b.onclick = () => { opts.setFont(f.key); render(); };
    list.appendChild(b);
  }
  back.querySelectorAll<HTMLButtonElement>(".size button").forEach((b) => {
    b.onclick = () => { opts.setSize(opts.current().size + Number(b.dataset.d)); render(); };
  });

  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); opts.onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === ",")) { e.preventDefault(); e.stopPropagation(); close(); }
  };
  back.onclick = (e) => { if (e.target === back) close(); };
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(back);
  render();
  (list.querySelector("button.on") as HTMLElement | null)?.focus();
}
