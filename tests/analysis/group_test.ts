import { assertEquals } from "@std/assert";
import { groupByJobAndStep } from "../../src/analysis/group.ts";
import { mapJobs, mapRunMeta } from "../../src/gh/mapping.ts";
import type { WorkflowRun } from "../../src/domain/types.ts";
import { loadFixture } from "../fake_gh.ts";

async function loadRun(
  runId: number,
  jobsFixture: string,
  overrides: Partial<WorkflowRun> = {},
): Promise<WorkflowRun> {
  const runsPayload = JSON.parse(await loadFixture("runs_list.json"));
  const rawRun = runsPayload.workflow_runs.find(
    (r: { id: number }) => r.id === runId,
  );
  if (!rawRun) throw new Error(`run ${runId} not in fixture`);
  const jobsPayload = JSON.parse(await loadFixture(jobsFixture));
  return { ...mapRunMeta(rawRun), ...overrides, jobs: mapJobs(jobsPayload.jobs) };
}

Deno.test("groupByJobAndStep: three sequential main-branch runs produce one job with three steps", async () => {
  const runs: WorkflowRun[] = [
    await loadRun(1001, "run_jobs_1001.json"), // oldest
    await loadRun(1002, "run_jobs_1002.json", { headBranch: "main" }),
    await loadRun(1003, "run_jobs_1003.json"), // newest
  ];
  const groups = groupByJobAndStep(runs);

  assertEquals(groups.length, 1);
  const build = groups[0]!;
  assertEquals(build.jobName, "build");
  assertEquals(build.steps.map((s) => s.stepName), ["Checkout", "Install", "Test"]);
  assertEquals(build.steps[0]?.executions.length, 3);

  // Install step deltas: 60s → 80s (+20s) → 70s (-10s vs 1002's 80s)
  const install = build.steps[1]!;
  assertEquals(install.executions.map((e) => e.durationMs), [60_000, 80_000, 70_000]);
  assertEquals(install.executions.map((e) => e.deltaMsFromPrevious), [null, 20_000, -10_000]);
});

Deno.test("groupByJobAndStep: matrix cells are distinct job groups", async () => {
  const matrix = await loadRun(1001, "run_jobs_matrix.json");
  const groups = groupByJobAndStep([matrix]);
  assertEquals(
    groups.map((g) => g.jobName),
    ["test (ubuntu-latest, 20)", "test (ubuntu-latest, 22)"],
  );
});

Deno.test("groupByJobAndStep: renamed step produces two distinct StepGroups", async () => {
  const run1 = await loadRun(1001, "run_jobs_1001.json");
  // Manually craft a run2 where "Install" is renamed to "Install deps"
  const renamed: WorkflowRun = {
    ...run1,
    runId: 9999,
    createdAt: "2026-04-25T10:00:00Z",
    jobs: [
      {
        ...run1.jobs[0]!,
        steps: run1.jobs[0]!.steps.map((s) =>
          s.name === "Install" ? { ...s, name: "Install deps" } : s
        ),
      },
    ],
  };
  const groups = groupByJobAndStep([run1, renamed]);
  const stepNames = groups[0]!.steps.map((s) => s.stepName);
  assertEquals(
    new Set(stepNames),
    new Set(["Checkout", "Install", "Install deps", "Test"]),
  );
  // "Install" and "Install deps" each have one execution
  const install = groups[0]!.steps.find((s) => s.stepName === "Install")!;
  const installDeps = groups[0]!.steps.find((s) => s.stepName === "Install deps")!;
  assertEquals(install.executions.length, 1);
  assertEquals(installDeps.executions.length, 1);
});
