import { assertEquals, assertStringIncludes } from "@std/assert";
import { tableReporter } from "../../src/reporter/table.ts";
import type { ReportData } from "../../src/domain/types.ts";
import { groupByJobAndStep } from "../../src/analysis/group.ts";
import { mapJobs, mapRunMeta } from "../../src/gh/mapping.ts";
import { loadFixture } from "../fake_gh.ts";

async function buildReport(): Promise<ReportData> {
  const payload = JSON.parse(await loadFixture("runs_list.json"));
  const runs = await Promise.all(
    [1001, 1002, 1003].map(async (id) => {
      const raw = payload.workflow_runs.find((r: { id: number }) => r.id === id)!;
      const jobs = JSON.parse(await loadFixture(`run_jobs_${id}.json`));
      return { ...mapRunMeta(raw), jobs: mapJobs(jobs.jobs) };
    }),
  );
  runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    repo: { owner: "acme", name: "app" },
    workflow: { file: "ci.yml", id: null, name: null },
    filter: { pullRequest: 42, limit: 20, includeReruns: false },
    generatedAt: "2026-04-24T00:00:00Z",
    runCount: runs.length,
    jobs: groupByJobAndStep(runs),
  };
}

async function render(color: boolean): Promise<string> {
  const data = await buildReport();
  const chunks: Uint8Array[] = [];
  const stdout = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
  const stderr = new WritableStream<Uint8Array>({ write: () => {} });
  await tableReporter().render(data, {
    stdout,
    stderr,
    now: () => new Date("2026-04-24T00:00:00Z"),
    color,
    options: {},
  });
  return chunks.map((c) => new TextDecoder().decode(c)).join("");
}

Deno.test("TableReporter (NO_COLOR): renders per-job matrix without Link column", async () => {
  const out = await render(false);
  assertStringIncludes(out, "acme/app · ci.yml");
  assertStringIncludes(out, "PR #42");
  assertStringIncludes(out, "▶ build");

  // Headers: Run + step names. No "Link" column.
  assertStringIncludes(out, "Run");
  assertStringIncludes(out, "Checkout");
  assertStringIncludes(out, "Install");
  assertStringIncludes(out, "Test");
  assertEquals(out.includes("Link"), false);

  // Run identifiers in body.
  assertStringIncludes(out, "#103");
  assertStringIncludes(out, "#102");
  assertStringIncludes(out, "#101");

  // Deltas: Install on run 1003 (main, 70s) vs run 1001 (main, 60s) = +10s slower → ▲ marker.
  assertStringIncludes(out, "▲10s");
  // Test step: 56s vs 55s → +1s, which is <5% of baseline → trivial tier (still ▲ arrow).
  assertStringIncludes(out, "▲1s");

  // No URLs visible when colors/links are off.
  assertEquals(out.includes("https://"), false);
});

Deno.test("TableReporter (color): embeds OSC 8 hyperlinks on run labels", async () => {
  const out = await render(true);
  // OSC 8 start sequence with the run URL.
  assertStringIncludes(out, "\x1b]8;;https://github.com/acme/app/actions/runs/1003");
  assertStringIncludes(out, "\x1b]8;;https://github.com/acme/app/actions/runs/1001");
  // Closing OSC 8 sequence.
  assertStringIncludes(out, "\x1b]8;;\x1b\\");
  // Borders are emitted.
  assertStringIncludes(out, "│");
  assertStringIncludes(out, "─");
});

Deno.test("TableReporter (no PR filter): omits the PR scope line", async () => {
  const data = await buildReport();
  const unfiltered: ReportData = {
    ...data,
    filter: { ...data.filter, pullRequest: null },
  };
  const chunks: Uint8Array[] = [];
  const stdout = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
  const stderr = new WritableStream<Uint8Array>({ write: () => {} });
  await tableReporter().render(unfiltered, {
    stdout,
    stderr,
    now: () => new Date(),
    color: false,
    options: {},
  });
  const out = chunks.map((c) => new TextDecoder().decode(c)).join("");
  assertStringIncludes(out, "3 runs · baseline:");
  assertEquals(out.includes("PR #"), false);
});

Deno.test("TableReporter (color): bolds significant regressions, dims trivial deltas", async () => {
  const out = await render(true);
  // Install: 70s after 60s → +10s, 16.7% (regression but not significant) → red, NOT bold.
  // The ANSI red sequence is `\x1b[31m`; bold is `\x1b[1m`. The Install delta should appear
  // without a leading bold escape.
  assertStringIncludes(out, "\x1b[31m▲10s\x1b[39m");

  // Test step: +1s on a 55s baseline = 1.8% → trivial → dim, not red.
  assertStringIncludes(out, "\x1b[2m▲1s\x1b[22m");

  // Checkout: 4s after 5s → -1s, 20% improvement → green ▼.
  assertStringIncludes(out, "\x1b[32m▼1s\x1b[39m");
});

Deno.test("TableReporter: paginates wide jobs into multiple sub-tables", async () => {
  // Synthesize a job with 30 long-named steps so even a 200-col terminal can't fit them all.
  const widePayload = JSON.parse(await loadFixture("run_jobs_1001.json"));
  const baseStep = widePayload.jobs[0].steps[0];
  widePayload.jobs[0].steps = Array.from({ length: 30 }, (_, i) => ({
    ...baseStep,
    name: `step-${(i + 1).toString().padStart(2, "0")}-with-a-fairly-long-name`,
    number: i + 1,
  }));
  const runsList = JSON.parse(await loadFixture("runs_list.json"));
  const raw = runsList.workflow_runs.find((r: { id: number }) => r.id === 1001)!;
  const run = { ...mapRunMeta(raw), jobs: mapJobs(widePayload.jobs) };

  const data = {
    repo: { owner: "acme", name: "app" },
    workflow: { file: "ci.yml", id: null, name: null },
    filter: { pullRequest: 42, limit: 20, includeReruns: false },
    generatedAt: "2026-04-25T00:00:00Z",
    runCount: 1,
    jobs: groupByJobAndStep([run]),
  };
  const chunks: Uint8Array[] = [];
  const stdout = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
  const stderr = new WritableStream<Uint8Array>({ write: () => {} });
  await tableReporter().render(data, {
    stdout,
    stderr,
    now: () => new Date(),
    color: false,
    options: {},
  });
  const out = chunks.map((c) => new TextDecoder().decode(c)).join("");

  // The "(steps a–b of 30)" annotation appears at least twice (multiple sub-tables).
  const annotations = out.match(/\(steps \d+–\d+ of 30\)/g) ?? [];
  assertEquals(annotations.length >= 2, true, `expected multiple chunks, saw: ${annotations}`);
  // First and last steps both appear (no data dropped).
  assertStringIncludes(out, "step-01");
  assertStringIncludes(out, "step-30");
});
