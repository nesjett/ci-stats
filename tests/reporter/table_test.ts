import { assertStringIncludes } from "@std/assert";
import { tableReporter } from "../../src/reporter/table.ts";
import type { ReportData } from "../../src/domain/types.ts";
import { groupByJobAndStep } from "../../src/analysis/group.ts";
import { mapJobs, mapRunMeta } from "../../src/gh/mapping.ts";
import { loadFixture } from "../fake_gh.ts";

async function loadRun(runId: number, jobsFixture: string) {
  const payload = JSON.parse(await loadFixture("runs_list.json"));
  const raw = payload.workflow_runs.find((r: { id: number }) => r.id === runId)!;
  const jobs = JSON.parse(await loadFixture(jobsFixture));
  return { ...mapRunMeta(raw), jobs: mapJobs(jobs.jobs) };
}

Deno.test("TableReporter: renders headings, steps and deltas with colors disabled", async () => {
  const runs = [
    await loadRun(1001, "run_jobs_1001.json"),
    await loadRun(1002, "run_jobs_1002.json"),
    await loadRun(1003, "run_jobs_1003.json"),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const data: ReportData = {
    repo: { owner: "acme", name: "app" },
    workflow: { file: "ci.yml", id: null, name: null },
    filter: { pullRequest: null, limit: 20, includeReruns: false },
    generatedAt: "2026-04-24T00:00:00Z",
    runCount: runs.length,
    jobs: groupByJobAndStep(runs),
  };

  const chunks: Uint8Array[] = [];
  const stdout = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
  const stderr = new WritableStream<Uint8Array>({ write: () => {} });

  await tableReporter().render(data, {
    stdout,
    stderr,
    now: () => new Date("2026-04-24T00:00:00Z"),
    color: false,
    options: {},
  });

  const out = chunks.map((c) => new TextDecoder().decode(c)).join("");
  assertStringIncludes(out, "acme/app · ci.yml");
  assertStringIncludes(out, "3 runs · all runs");
  assertStringIncludes(out, "▶ build");
  assertStringIncludes(out, "· Install");
  // run 1002 is on feature/x so it's excluded from baselines — run 1003 (main, 70s) compares to run 1001 (main, 60s).
  assertStringIncludes(out, "+10s");
  assertStringIncludes(out, "+1s"); // Test step: run 1003 (56s) vs run 1001 (55s)
  assertStringIncludes(out, "https://github.com/acme/app/actions/runs/1003");
});
