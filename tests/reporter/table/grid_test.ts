import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  renderGrid,
  truncateEnd,
  truncateMiddle,
  visibleLength,
} from "../../../src/reporter/table/grid.ts";

Deno.test("visibleLength: strips ANSI color escapes", () => {
  assertEquals(visibleLength("\x1b[31mhi\x1b[0m"), 2);
});

Deno.test("truncateEnd: adds ellipsis when over max", () => {
  assertEquals(truncateEnd("Checkout", 5), "Chec…");
  assertEquals(truncateEnd("Check", 5), "Check");
});

Deno.test("truncateMiddle: preserves both ends", () => {
  const out = truncateMiddle("Run GIT_MESSAGE=prefix-suffix", 12);
  assertEquals(out.length, 12);
  assertEquals(out.startsWith("Run GI"), true);
  assertEquals(out.endsWith("ffix") || out.endsWith("uffix"), true);
  assertEquals(truncateMiddle("short", 10), "short");
});

Deno.test("renderGrid: inserts column separators and a header rule", () => {
  const out = renderGrid(
    [
      ["Run", "Step A", "Link"],
      ["#101", "1s", "https://x/1"],
    ],
    {
      indent: "  ",
      columnSeparator: " │ ",
      headerRule: true,
    },
  );
  assertStringIncludes(out, "│");
  assertStringIncludes(out, "─");
  const lines = out.split("\n");
  // Header, rule, data row — 3 non-empty lines at minimum.
  assertEquals(lines.filter((l) => l.trim().length > 0).length, 3);
});

Deno.test("renderGrid: outerBox draws full table with proper junctions", () => {
  const out = renderGrid(
    [
      ["Run", "Step A", "Step B"],
      ["#101", "1s", "2s"],
      ["#102", "1s", "3s"],
    ],
    {
      indent: "  ",
      headerRule: true,
      outerBox: true,
    },
  );
  // All four corners.
  assertStringIncludes(out, "┌");
  assertStringIncludes(out, "┐");
  assertStringIncludes(out, "└");
  assertStringIncludes(out, "┘");
  // Header divider with cross junctions.
  assertStringIncludes(out, "├");
  assertStringIncludes(out, "┤");
  assertStringIncludes(out, "┼");
  // Top/bottom T-junctions.
  assertStringIncludes(out, "┬");
  assertStringIncludes(out, "┴");
  // Vertical bars on the row edges.
  const dataLines = out.split("\n").filter((l) => l.trim().startsWith("│"));
  assertEquals(dataLines.length, 3); // header + 2 data rows
  for (const line of dataLines) {
    assertEquals(line.trim().endsWith("│"), true);
  }
});
