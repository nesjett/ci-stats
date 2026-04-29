import { assertEquals, assertStringIncludes } from "@std/assert";
import { jsonReporter } from "../../../src/reporter/json/mod.ts";
import type { ReportData } from "../../../src/domain/types.ts";
import { groupByJobAndStep } from "../../../src/analysis/group.ts";
import { mapJobs, mapRunMeta } from "../../../src/gh/mapping.ts";
import { loadFixture } from "../../fake_gh.ts";

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
    generatedAt: "2026-04-29T00:00:00Z",
    runCount: runs.length,
    jobs: groupByJobAndStep(runs),
  };
}

async function render(data: ReportData): Promise<string> {
  const chunks: Uint8Array[] = [];
  const stdout = new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) });
  const stderr = new WritableStream<Uint8Array>({ write: () => {} });
  await jsonReporter().render(data, {
    stdout,
    stderr,
    now: () => new Date(),
    color: false,
    options: {},
  });
  return chunks.map((c) => new TextDecoder().decode(c)).join("");
}

Deno.test("JsonReporter: emits valid JSON with schema discriminator", async () => {
  const empty: ReportData = {
    repo: { owner: "acme", name: "app" },
    workflow: { file: "ci.yml", id: null, name: null },
    filter: { pullRequest: null, limit: 20, includeReruns: false },
    generatedAt: "2026-04-29T00:00:00Z",
    runCount: 0,
    jobs: [],
  };
  const out = await render(empty);
  const parsed = JSON.parse(out);
  assertEquals(parsed.schema, "gh-workflow-explorer/v1");
  assertEquals(parsed.generatedBy, "gh-workflow-explorer");
  assertEquals(parsed.data.runCount, 0);
  assertEquals(parsed.data.jobs, []);
  assertEquals(parsed.data.filter.pullRequest, null);
});

Deno.test("JsonReporter: compact, no whitespace, single trailing newline", async () => {
  const data = await buildReport();
  const out = await render(data);
  assertEquals(out.includes('{\n  "schema"'), false);
  assertEquals(out.includes("\n  "), false);
  assertEquals(out.endsWith("}\n"), true);
});

Deno.test("JsonReporter: emits stable IDs on StepGroup and StepExecution", async () => {
  const data = await buildReport();
  const out = await render(data);
  const parsed = JSON.parse(out);
  const buildJob = parsed.data.jobs[0];
  const checkout = buildJob.steps[0];
  assertEquals(checkout.id, "build::Checkout");
  const firstExec = checkout.executions[0];
  // id format: ${runId}-${attempt}-${stepNumber}
  assertEquals(typeof firstExec.id, "string");
  assertStringIncludes(firstExec.id, "-1-1"); // attempt 1, step 1
});

Deno.test("JsonReporter: nullable fields serialize as JSON null, not omitted", async () => {
  const data = await buildReport();
  const out = await render(data);
  const parsed = JSON.parse(out);
  const installFirst = parsed.data.jobs[0].steps[1].executions[0];
  // First execution in series → deltaMsFromPrevious must be present and null.
  assertEquals("deltaMsFromPrevious" in installFirst, true);
  assertEquals(installFirst.deltaMsFromPrevious, null);
});

Deno.test("JsonReporter: round-trip preserves structural shape", async () => {
  const data = await buildReport();
  const out = await render(data);
  const parsed = JSON.parse(out);
  // Strip the schema/envelope to compare against ReportData.
  const got = parsed.data;
  // Strip the synthetic id fields the reporter adds.
  const stripIds = (g: { steps: Array<{ executions: Array<{ id?: unknown }>; id?: unknown }> }) => {
    for (const s of g.steps) {
      delete s.id;
      for (const e of s.executions) delete e.id;
    }
  };
  for (const job of got.jobs) stripIds(job);
  assertEquals(got, JSON.parse(JSON.stringify(data)));
});

Deno.test("JsonReporter: handles unicode and embedded quotes in step names", async () => {
  const data = await buildReport();
  // Mutate the first step's name to include problematic chars.
  const fancy: ReportData = {
    ...data,
    jobs: data.jobs.map((j, i) =>
      i === 0
        ? {
          ...j,
          steps: j.steps.map((s, k) =>
            k === 0 ? { ...s, stepName: 'Checkout 🧹 / 中文 "quoted" \\path' } : s
          ),
        }
        : j
    ),
  };
  const out = await render(fancy);
  const parsed = JSON.parse(out);
  assertEquals(parsed.data.jobs[0].steps[0].stepName, 'Checkout 🧹 / 中文 "quoted" \\path');
  assertEquals(parsed.data.jobs[0].steps[0].id, 'build::Checkout 🧹 / 中文 "quoted" \\path');
});
