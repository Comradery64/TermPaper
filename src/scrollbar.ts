/**
 * macOS-style overlay scrollbar: a thumb that appears while scrolling or when the pointer
 * comes within 8% of the right edge, then fades out. Draggable. Replaces the native bar,
 * which WebKit won't restyle on hover.
 */
const ZONE = 0.08;
const LINGER_MS = 900;

export function overlayScrollbar(host: HTMLElement) {
  const thumb = document.createElement("div");
  thumb.id = "scroll-thumb";
  host.appendChild(thumb);
  let viewport: HTMLElement | null = null;
  let near = false, dragging = false, hideTimer: number | undefined;

  const show = () => {
    thumb.classList.add("on");
    clearTimeout(hideTimer);
    if (!near && !dragging) hideTimer = window.setTimeout(() => thumb.classList.remove("on"), LINGER_MS);
  };
  const place = () => {
    if (!viewport) return false;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    if (scrollHeight <= clientHeight + 1) { thumb.style.display = "none"; return false; }
    thumb.style.display = "";
    const h = Math.max(28, (clientHeight * clientHeight) / scrollHeight);
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - h);
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translateY(${top}px)`;
    return true;
  };
  const attach = () => {
    const v = host.querySelector<HTMLElement>(".xterm-viewport");
    if (!v || v === viewport) return;
    viewport = v;
    v.addEventListener("scroll", () => { if (place()) show(); }, { passive: true });
    new ResizeObserver(place).observe(v);
  };

  document.addEventListener("mousemove", (e) => {
    attach();
    const r = host.getBoundingClientRect();
    const was = near;
    near = e.clientX >= innerWidth * (1 - ZONE) && e.clientY >= r.top && e.clientY <= r.bottom;
    if (near && place()) show();
    else if (was && !near) show();   // start the fade
  });
  document.addEventListener("mouseleave", () => { near = false; show(); });

  thumb.addEventListener("pointerdown", (e) => {
    if (!viewport) return;
    e.preventDefault();
    dragging = true;
    thumb.setPointerCapture(e.pointerId);
    const y0 = e.clientY, s0 = viewport.scrollTop;
    const { scrollHeight, clientHeight } = viewport;
    const ratio = (scrollHeight - clientHeight) / (clientHeight - thumb.offsetHeight);
    const move = (m: PointerEvent) => { viewport!.scrollTop = s0 + (m.clientY - y0) * ratio; };
    const up = () => {
      dragging = false;
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", up);
      show();
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", up);
  });

  return { refresh: () => { attach(); place(); } };
}
