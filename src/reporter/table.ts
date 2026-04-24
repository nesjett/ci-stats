import * as colors from "@std/fmt/colors";
import type { JobGroup, ReportData, StepExecution, StepGroup } from "../domain/types.ts";
import type { ReporterContext, ReporterFactory } from "./reporter.ts";
import { formatDelta, formatMs } from "../util/time.ts";

export const tableReporter: ReporterFactory = () => ({
  name: "table",
  async render(data: ReportData, ctx: ReporterContext) {
    const writer = ctx.stdout.getWriter();
    try {
      for (const chunk of renderReport(data, ctx.color)) {
        await writer.write(new TextEncoder().encode(chunk));
      }
    } finally {
      writer.releaseLock();
    }
  },
});

function* renderReport(data: ReportData, color: boolean): Generator<string> {
  const c = palette(color);
  yield c.bold(`\n${data.repo.owner}/${data.repo.name} · ${data.workflow.file}`) + "\n";
  const filter = data.filter.pullRequest !== null ? `PR #${data.filter.pullRequest}` : "all runs";
  const reruns = data.filter.includeReruns ? " (incl. re-runs)" : "";
  yield c.dim(
    `${data.runCount} run${data.runCount === 1 ? "" : "s"} · ${filter}${reruns}` +
      ` · baseline: prev successful same-branch\n\n`,
  );
  if (data.jobs.length === 0) {
    yield c.dim("no matching runs\n");
    return;
  }
  for (const job of data.jobs) {
    yield* renderJob(job, c);
  }
}

function* renderJob(job: JobGroup, c: Palette): Generator<string> {
  yield c.bold(`▶ ${job.jobName}\n`);
  for (const step of job.steps) {
    yield* renderStep(step, c);
  }
  yield "\n";
}

function* renderStep(step: StepGroup, c: Palette): Generator<string> {
  yield c.cyan(`  · ${step.stepName}`) + c.dim(`  (${step.executions.length} exec)\n`);
  const display = [...step.executions].reverse(); // newest first
  const rows = display.map((e) => executionRow(e, c));
  yield* renderGrid(rows, "    ");
}

interface Row {
  readonly cells: readonly string[];
  readonly raw: readonly string[];
}

function executionRow(e: StepExecution, c: Palette): Row {
  const status = statusSymbol(e, c);
  const run = c.dim(`#${e.runNumber}`);
  const id = c.dim(`(${e.runId})`);
  const branch = c.dim(truncate(e.headBranch, 20));
  const duration = formatMs(e.durationMs);
  const delta = colorDelta(e.deltaMsFromPrevious, c);
  const link = c.dim(e.runHtmlUrl);
  const raw = [status, run, id, branch, duration, delta, link];
  return {
    raw,
    cells: [
      status,
      run,
      id,
      branch,
      duration.padStart(7),
      delta.padStart(8),
      link,
    ],
  };
}

function statusSymbol(e: StepExecution, c: Palette): string {
  switch (e.conclusion) {
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

function colorDelta(ms: number | null, c: Palette): string {
  if (ms === null) return c.dim("—");
  const s = formatDelta(ms);
  if (ms === 0) return c.dim(s);
  return ms > 0 ? c.red(s) : c.green(s);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function* renderGrid(rows: readonly Row[], indent: string): Generator<string> {
  if (rows.length === 0) return;
  const widths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.cells.length; i++) {
      const w = visibleLength(row.cells[i] ?? "");
      widths[i] = Math.max(widths[i] ?? 0, w);
    }
  }
  for (const row of rows) {
    const parts: string[] = [];
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i] ?? "";
      const pad = " ".repeat((widths[i] ?? 0) - visibleLength(cell));
      const isLast = i === row.cells.length - 1;
      parts.push(isLast ? cell : cell + pad);
    }
    yield indent + parts.join("  ") + "\n";
  }
}

// deno-lint-ignore no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visibleLength(s: string): number {
  return [...s.replace(ANSI_RE, "")].length;
}

interface Palette {
  bold: (s: string) => string;
  dim: (s: string) => string;
  cyan: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
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
    };
  }
  return {
    bold: colors.bold,
    dim: colors.dim,
    cyan: colors.cyan,
    red: colors.red,
    green: colors.green,
    yellow: colors.yellow,
  };
}
