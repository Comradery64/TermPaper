// TermPaper for Ghostty: ruled lines, margin line, binder holes and pressed-in ink,
// drawn over the terminal. Every size is relative to the cell size, so it scales
// with font size and display density. Colors match src/style.css.

// Row height / cell width, to get the cell width when the cursor is an underline or bar. Monaspace Radon with adjust-cell-height = 60%; retune for
// other fonts: put cursor-style = block in the config and read iCurrentCursor.w/z.
const float CELL_RATIO = 34.0 / 11.0;

const vec3 RULE = vec3(0.624, 0.796, 0.918);     // #9fcbea
const vec3 MARGIN = vec3(0.710, 0.478, 0.698);   // #b57ab2
const vec3 HOLE = vec3(0.663, 0.831, 0.945);     // #a9d4f1

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float ink(vec2 p) { return 1.0 - lum(texture(iChannel0, p / iResolution.xy).rgb); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord;
  vec3 c = texture(iChannel0, p / iResolution.xy).rgb;

  // row pitch and phase come from the cursor, so rules sit under the text rows
  vec4 cur = iCurrentCursor;
  // a block cursor's rect is one cell; an underline's is the cell height but a sliver wide
  float row = max(cur.w, cur.z * CELL_RATIO);
  float s = row / CELL_RATIO / 10.2;   // 1 unit = 1 CSS px in TermPaper (Radon 17px is 10.2px wide)
  float top = cur.y;   // Ghostty's fragCoord runs top-down on macOS
  float y = p.y;

  // pressed-in ink: shade the upper-left wall, light the lower-right rim
  float shade = ink(p + vec2(0.45, 0.55) * s) - ink(p);
  float light = ink(p + vec2(-0.5, -0.6) * s) - ink(p);
  c = mix(c, vec3(0.08, 0.09, 0.16), clamp(shade, 0.0, 1.0) * 0.35);
  c = mix(c, vec3(1.0), clamp(light, 0.0, 1.0) * 0.6);
  // paper grain breaking up the ink
  c = mix(c, vec3(0.96), ink(p) * hash(floor(p / max(s, 1.0))) * 0.12);

  // ruled lines along the bottom of each row, below the top padding
  float k = mod(y - top, row);
  if (k > row - max(s, 1.0) && y > 24.0 * s) c *= RULE;

  // margin line
  float mx = 70.0 * s;
  if (abs(p.x - mx) < 0.75 * max(s, 1.0)) c = mix(c, c * MARGIN, 0.9);

  // three binder holes at 3-ring spacing, lit from the top-left
  vec2 hp = vec2(33.0 * s, 0.0);
  for (int i = 0; i < 3; i++) {
    float f = i == 0 ? 0.114 : (i == 1 ? 0.5 : 0.886);
    vec2 d = p - vec2(hp.x, iResolution.y * f);
    float r = length(d), R = 9.0 * s;
    if (r < R) {
      vec3 h = HOLE;
      float wall = dot(normalize(d + 1e-4), vec2(0.6, 0.8));   // +1 at bottom-right
      h *= 1.0 - 0.3 * smoothstep(R - 2.4 * s, R, r) * max(-wall, 0.0);
      h = mix(h, vec3(1.0), 0.45 * smoothstep(R - 1.2 * s, R, r) * max(wall, 0.0));
      c = mix(h, c, smoothstep(R - 0.8, R, r));
    }
  }
  fragColor = vec4(c, 1.0);
}
