export const BOX = {
  vertical: "│",
  horizontal: "─",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  topT: "┬",
  bottomT: "┴",
  leftT: "├",
  rightT: "┤",
  cross: "┼",
} as const;

export interface GridOptions {
  readonly indent: string;
  /** String placed between cells. Ignored when `outerBox` is true. Defaults to two spaces. */
  readonly columnSeparator?: string;
  /** Draw a horizontal rule after the first row (the header). */
  readonly headerRule?: boolean;
  /** Wrap the table in a full Unicode box (top/bottom/sides + junctions). */
  readonly outerBox?: boolean;
  /** Optional wrapper applied to border/rule characters (e.g. colors.dim). */
  readonly borderColor?: (s: string) => string;
}

interface RuleChars {
  readonly left: string;
  readonly junction: string;
  readonly right: string;
  readonly fill: string;
}

export function renderGrid(rows: readonly string[][], opts: GridOptions): string {
  if (rows.length === 0) return "";
  const paint = opts.borderColor ?? identity;
  const cols = Math.max(...rows.map((r) => r.length));
  const widths: number[] = new Array(cols).fill(0);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i] ?? 0, visibleLength(row[i] ?? ""));
    }
  }

  const lines: string[] = [];

  if (opts.outerBox) {
    lines.push(opts.indent + buildRule(widths, TOP_CHARS, paint));
  }

  const sep = opts.outerBox ? ` ${BOX.vertical} ` : (opts.columnSeparator ?? "  ");
  const rowLeft = opts.outerBox ? `${BOX.vertical} ` : "";
  const rowRight = opts.outerBox ? ` ${BOX.vertical}` : "";

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const parts: string[] = [];
    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? "";
      const pad = " ".repeat(Math.max(0, (widths[i] ?? 0) - visibleLength(cell)));
      // With outerBox we always pad every cell so the bars line up; without it we
      // skip padding the trailing cell (preserves the previous compact look).
      const padded = (!opts.outerBox && i === row.length - 1) ? cell : cell + pad;
      parts.push(padded);
    }
    lines.push(opts.indent + paint(rowLeft) + parts.join(paint(sep)) + paint(rowRight));

    if (opts.headerRule && r === 0) {
      if (opts.outerBox) {
        lines.push(opts.indent + buildRule(widths, MID_CHARS, paint));
      } else {
        const totalWidth = widths.reduce((acc, w) => acc + w, 0) +
          visibleLength(sep) * Math.max(0, cols - 1);
        lines.push(opts.indent + paint(BOX.horizontal.repeat(totalWidth)));
      }
    }
  }

  if (opts.outerBox) {
    lines.push(opts.indent + buildRule(widths, BOTTOM_CHARS, paint));
  }
  return lines.join("\n") + "\n";
}

const TOP_CHARS: RuleChars = {
  left: BOX.topLeft,
  junction: BOX.topT,
  right: BOX.topRight,
  fill: BOX.horizontal,
};
const MID_CHARS: RuleChars = {
  left: BOX.leftT,
  junction: BOX.cross,
  right: BOX.rightT,
  fill: BOX.horizontal,
};
const BOTTOM_CHARS: RuleChars = {
  left: BOX.bottomLeft,
  junction: BOX.bottomT,
  right: BOX.bottomRight,
  fill: BOX.horizontal,
};

function buildRule(
  widths: readonly number[],
  chars: RuleChars,
  paint: (s: string) => string,
): string {
  const segments = widths.map((w) => chars.fill.repeat(w + 2));
  return paint(chars.left + segments.join(chars.junction) + chars.right);
}

// CSI SGR (colors) and OSC sequences (e.g. OSC 8 hyperlinks) — both have zero visible width.
// deno-lint-ignore no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m|\x1b\][^\x07]*?(?:\x07|\x1b\\)/g;

/** Width of a string as displayed on a terminal, ignoring ANSI escapes. */
export function visibleLength(s: string): number {
  return [...s.replace(ANSI_RE, "")].length;
}

/**
 * Wraps `text` in an OSC 8 hyperlink to `url`. Modern terminals render the text as a clickable
 * link; older terminals display the text unchanged. The escape carries zero visible width.
 */
export function osc8Link(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function truncateEnd(s: string, max: number): string {
  if (max <= 0) return "";
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}

/** Middle-truncates: "Run GIT_MESSAGE=..." instead of "Run GIT_MESSAG…" */
export function truncateMiddle(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max < 3) return "…".repeat(max);
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return s.slice(0, head) + "…" + s.slice(s.length - tail);
}

function identity<T>(x: T): T {
  return x;
}
