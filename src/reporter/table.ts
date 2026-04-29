import * as colors from "@std/fmt/colors";
import type { Conclusion, JobGroup, ReportData, StepExecution } from "../domain/types.ts";
import type { ReporterContext, ReporterFactory } from "./reporter.ts";
import { formatMs } from "../util/time.ts";
import { BOX, osc8Link, renderGrid, truncateMiddle, visibleLength } from "./grid.ts";

const DEFAULT_WIDTH = 120;
const STEP_COL_MAX = 36;
const STEP_COL_MIN = 4;

export const tableReporter: ReporterFactory = () => ({
  name: "table",
  async render(data: ReportData, ctx: ReporterContext) {
    const writer = ctx.stdout.getWriter();
    try {
      const width = detectWidth();
      for (const chunk of renderReport(data, ctx.color, width)) {
        await writer.write(new TextEncoder().encode(chunk));
      }
    } finally {
      writer.releaseLock();
    }
  },
});

function detectWidth(): number {
  try {
    return Deno.consoleSize().columns;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function* renderReport(data: ReportData, color: boolean, width: number): Generator<string> {
  const c = palette(color);
  yield c.bold(`\n${data.repo.owner}/${data.repo.name} · ${data.workflow.file}`) + "\n";
  const reruns = data.filter.includeReruns ? " (incl. re-runs)" : "";
  const scope = data.filter.pullRequest !== null ? `PR #${data.filter.pullRequest} · ` : "";
  yield c.dim(
    `${scope}${data.runCount} run${data.runCount === 1 ? "" : "s"}${reruns}` +
      ` · baseline: prev successful same-branch\n\n`,
  );
  if (data.jobs.length === 0) {
    yield c.dim("no matching runs\n");
    return;
  }
  for (const job of data.jobs) {
    yield* renderJob(job, c, width);
  }
}

interface RunMeta {
  readonly key: string;
  readonly runId: number;
  readonly runNumber: number;
  readonly attempt: number;
  readonly runHtmlUrl: string;
  readonly runCreatedAt: string;
  readonly headBranch: string;
  readonly conclusion: Conclusion | null;
}

interface StepCol {
  readonly index: number;
  readonly fullName: string;
  /** May be middle-truncated to STEP_COL_MAX. */
  readonly displayName: string;
  /** Final column width (max of displayName and widest data cell). */
  readonly width: number;
}

function* renderJob(job: JobGroup, c: Palette, terminalWidth: number): Generator<string> {
  yield `${c.cyan("▶")} ${c.bold(job.jobName)}\n`;

  const runs = collectRuns(job);
  if (runs.length === 0) {
    yield c.dim("  (no executions)\n\n");
    return;
  }

  const runColWidth = Math.max(
    ...runs.map((r) => visibleLength(runLabelPlain(r))),
    "Run".length,
  );
  const stepCols = computeStepCols(job, runs, c);
  const chunks = packChunks(stepCols, runColWidth, terminalWidth);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (chunks.length > 1) {
      const first = chunk[0]!.index + 1;
      const last = chunk[chunk.length - 1]!.index + 1;
      yield c.dim(`  (steps ${first}–${last} of ${stepCols.length})\n`);
    }
    yield* renderChunk(chunk, runs, job, c);
    yield "\n";
  }

  // Single footnote per job, listing all middle-truncated step names.
  const truncated = stepCols.filter((s) => s.fullName !== s.displayName);
  if (truncated.length > 0) {
    for (const s of truncated) {
      yield c.dim(`  [${s.displayName}] ${s.fullName}`) + "\n";
    }
    yield "\n";
  }
}

function* renderChunk(
  chunk: readonly StepCol[],
  runs: readonly RunMeta[],
  job: JobGroup,
  c: Palette,
): Generator<string> {
  const header = [
    c.bold(c.cyan("Run")),
    ...chunk.map((s) => c.bold(c.cyan(s.displayName))),
  ];
  const rows: string[][] = [header];
  for (const run of runs) {
    rows.push([
      runLabelCell(run, c),
      ...chunk.map((meta) => {
        const step = job.steps[meta.index]!;
        const exec = findExecution(step.executions, run.key);
        return exec ? stepCell(exec, c) : c.dim("—");
      }),
    ]);
  }
  yield renderGrid(rows, {
    indent: "  ",
    headerRule: true,
    outerBox: true,
    borderColor: c.dim,
  });
}

function computeStepCols(
  job: JobGroup,
  runs: readonly RunMeta[],
  c: Palette,
): StepCol[] {
  return job.steps.map((step, index) => {
    const displayName = step.stepName.length > STEP_COL_MAX
      ? truncateMiddle(step.stepName, STEP_COL_MAX)
      : step.stepName;
    let width = visibleLength(displayName);
    for (const run of runs) {
      const exec = findExecution(step.executions, run.key);
      const cell = exec ? stepCell(exec, c) : c.dim("—");
      width = Math.max(width, visibleLength(cell));
    }
    return {
      index,
      fullName: step.stepName,
      displayName,
      width: Math.max(STEP_COL_MIN, width),
    };
  });
}

/**
 * Greedily packs step columns into chunks that each fit the terminal width.
 * Each chunk shares the Run column. Returns at least one chunk even if a single
 * column would overflow (terminal will wrap on that line — better than dropping data).
 */
function packChunks(
  steps: readonly StepCol[],
  runColWidth: number,
  terminalWidth: number,
): StepCol[][] {
  if (steps.length === 0) return [];
  const sepWidth = visibleLength(` ${BOX.vertical} `); // " │ " between columns = 3
  const boxOverhead = visibleLength(`${BOX.vertical} `) + visibleLength(` ${BOX.vertical}`); // "│ " + " │" = 4
  const indent = 2;
  const chunks: StepCol[][] = [];
  let current: StepCol[] = [];
  let currentWidth = indent + boxOverhead + runColWidth;
  for (const step of steps) {
    const addedWidth = sepWidth + step.width;
    if (current.length > 0 && currentWidth + addedWidth > terminalWidth) {
      chunks.push(current);
      current = [];
      currentWidth = indent + boxOverhead + runColWidth;
    }
    current.push(step);
    currentWidth += addedWidth;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function runLabelPlain(r: RunMeta): string {
  const attempt = r.attempt > 1 ? ` a${r.attempt}` : "";
  return `#${r.runNumber} (${r.runId})${attempt}`;
}

function runLabelCell(r: RunMeta, c: Palette): string {
  const symbol = conclusionSymbol(r.conclusion, c);
  const label = `#${r.runNumber} ${c.dim("(" + r.runId + ")")}`;
  const attempt = r.attempt > 1 ? c.yellow(` a${r.attempt}`) : "";
  const colored = tintByConclusion(label, r.conclusion, c);
  const cell = `${symbol} ${colored}${attempt}`;
  return c.linksEnabled ? osc8Link(r.runHtmlUrl, cell) : cell;
}

function conclusionSymbol(conclusion: Conclusion | null, c: Palette): string {
  switch (conclusion) {
    case "success":
      return c.green("✓");
    case "failure":
    case "timed_out":
      return c.red("✗");
    case "cancelled":
      return c.yellow("⊘");
    case "skipped":
      return c.dim("·");
    default:
      return c.dim("?");
  }
}

function tintByConclusion(s: string, conclusion: Conclusion | null, c: Palette): string {
  switch (conclusion) {
    case "success":
      return c.green(s);
    case "failure":
    case "timed_out":
      return c.red(s);
    case "cancelled":
      return c.yellow(s);
    default:
      return s;
  }
}

function collectRuns(job: JobGroup): RunMeta[] {
  const seen = new Map<string, RunMeta>();
  const seenSteps = new Map<string, Conclusion[]>();
  for (const step of job.steps) {
    for (const e of step.executions) {
      const key = `${e.runId}-${e.attempt}`;
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          runId: e.runId,
          runNumber: e.runNumber,
          attempt: e.attempt,
          runHtmlUrl: e.runHtmlUrl,
          runCreatedAt: e.runCreatedAt,
          headBranch: e.headBranch,
          conclusion: null,
        });
      }
      if (e.conclusion) {
        if (!seenSteps.has(key)) seenSteps.set(key, []);
        seenSteps.get(key)!.push(e.conclusion);
      }
    }
  }
  const out: RunMeta[] = [];
  for (const [key, meta] of seen) {
    out.push({ ...meta, conclusion: worstConclusion(seenSteps.get(key) ?? []) });
  }
  return out.sort((a, b) => b.runCreatedAt.localeCompare(a.runCreatedAt));
}

/** The run row's conclusion = the worst step conclusion seen, with a specific priority order. */
function worstConclusion(conclusions: readonly Conclusion[]): Conclusion | null {
  if (conclusions.length === 0) return null;
  // Priority: any explicit failure dominates. "skipped" ranks LAST — a run where
  // some steps skipped and others succeeded is a success overall.
  const order: Conclusion[] = [
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "neutral",
    "success",
    "skipped",
  ];
  for (const c of order) {
    if (conclusions.includes(c)) return c;
  }
  return null;
}

function findExecution(
  executions: readonly StepExecution[],
  key: string,
): StepExecution | undefined {
  return executions.find((e) => `${e.runId}-${e.attempt}` === key);
}

function stepCell(e: StepExecution, c: Palette): string {
  if (e.conclusion === "skipped") return c.dim("·");
  const failed = e.conclusion === "failure" || e.conclusion === "timed_out";
  const cancelled = e.conclusion === "cancelled";
  const duration = formatMs(e.durationMs);
  const delta = formatDeltaPresentation(e.deltaMsFromPrevious, e.durationMs, c);
  const body = `${duration}${delta ? " " + delta : ""}`;
  if (failed) return c.red(`✗ ${body}`);
  if (cancelled) return c.yellow(`⊘ ${body}`);
  return body;
}

/**
 * Renders a delta with a magnitude-tiered presentation:
 *   - `±0`             dim (no change)
 *   - `▼3s`            green (faster)
 *   - `▲500ms`         dim (trivial change: <500ms OR <5% of baseline)
 *   - `▲10s`           red (regression)
 *   - `▲30s`           bold red (significant regression: ≥20% AND ≥1s)
 *
 * The arrow encodes direction so the signal survives `NO_COLOR`.
 */
function formatDeltaPresentation(
  deltaMs: number | null,
  durationMs: number | null,
  c: Palette,
): string {
  if (deltaMs === null) return "";
  if (deltaMs === 0) return c.dim("±0");

  const abs = Math.abs(deltaMs);
  const baseline = durationMs !== null ? durationMs - deltaMs : null;
  const pct = baseline !== null && baseline > 0 ? abs / baseline : null;
  const trivial = abs < 500 || (pct !== null && pct < 0.05);
  const significant = !trivial && pct !== null && pct >= 0.20 && abs >= 1000;

  const arrow = deltaMs > 0 ? "▲" : "▼";
  const text = `${arrow}${formatMs(abs)}`;

  if (trivial) return c.dim(text);
  if (deltaMs > 0) {
    return significant ? c.bold(c.red(text)) : c.red(text);
  }
  return c.green(text);
}

interface Palette {
  bold: (s: string) => string;
  dim: (s: string) => string;
  cyan: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  /** When true, OSC 8 hyperlinks are emitted alongside ANSI colors. */
  readonly linksEnabled: boolean;
}

function palette(enabled: boolean): Palette {
  if (!enabled) {
    const identity = (s: string) => s;
    return {
      bold: identity,
      dim: identity,
      cyan: identity,
      red: identity,
      green: identity,
      yellow: identity,
      linksEnabled: false,
    };
  }
  return {
    bold: colors.bold,
    dim: colors.dim,
    cyan: colors.cyan,
    red: colors.red,
    green: colors.green,
    yellow: colors.yellow,
    linksEnabled: true,
  };
}
