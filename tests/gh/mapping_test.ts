import { assertEquals } from "@std/assert";
import {
  type JobsPayload,
  mapJobs,
  mapRunMeta,
  type RunsListPayload,
} from "../../src/gh/mapping.ts";
import { loadFixture } from "../fake_gh.ts";

Deno.test("mapRunMeta: extracts run metadata and PR numbers", async () => {
  const payload: RunsListPayload = JSON.parse(await loadFixture("runs_list.json"));
  const meta = payload.workflow_runs.map(mapRunMeta);

  assertEquals(meta.length, 3);
  assertEquals(meta[0]?.runId, 1003);
  assertEquals(meta[0]?.headBranch, "main");
  assertEquals(meta[0]?.pullRequestNumbers, []);
  assertEquals(meta[1]?.pullRequestNumbers, [42]);
  assertEquals(meta[1]?.event, "pull_request");
});

Deno.test("mapJobs: computes durations and preserves step order", async () => {
  const payload: JobsPayload = JSON.parse(await loadFixture("run_jobs_1001.json"));
  const jobs = mapJobs(payload.jobs);

  assertEquals(jobs.length, 1);
  const build = jobs[0]!;
  assertEquals(build.name, "build");
  assertEquals(build.durationMs, 120_000);
  assertEquals(build.steps.length, 3);
  assertEquals(build.steps.map((s) => s.name), ["Checkout", "Install", "Test"]);
  assertEquals(build.steps[0]?.durationMs, 5_000);
  assertEquals(build.steps[1]?.durationMs, 60_000);
  assertEquals(build.steps[2]?.durationMs, 55_000);
});

Deno.test("mapJobs: skipped steps get null duration", async () => {
  const payload: JobsPayload = JSON.parse(await loadFixture("run_jobs_skipped.json"));
  const jobs = mapJobs(payload.jobs);
  const cache = jobs[0]?.steps[1];
  assertEquals(cache?.name, "Cache");
  assertEquals(cache?.conclusion, "skipped");
  assertEquals(cache?.durationMs, null);
});

Deno.test("mapJobs: matrix jobs keep their parameterized names as identity", async () => {
  const payload: JobsPayload = JSON.parse(await loadFixture("run_jobs_matrix.json"));
  const jobs = mapJobs(payload.jobs);
  assertEquals(jobs.map((j) => j.name), [
    "test (ubuntu-latest, 20)",
    "test (ubuntu-latest, 22)",
  ]);
});
