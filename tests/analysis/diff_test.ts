import { assertEquals } from "@std/assert";
import { computeDeltas } from "../../src/analysis/diff.ts";
import type { Conclusion, StepExecution } from "../../src/domain/types.ts";

type Raw = Omit<StepExecution, "deltaMsFromPrevious">;

function make(
  opts: {
    runId: number;
    branch?: string;
    durationMs: number | null;
    conclusion?: Conclusion;
  },
): Raw {
  return {
    runId: opts.runId,
    runNumber: opts.runId,
    runHtmlUrl: `https://x/${opts.runId}`,
    runCreatedAt: new Date(opts.runId * 1000).toISOString(),
    headSha: `sha${opts.runId}`,
    headBranch: opts.branch ?? "main",
    attempt: 1,
    stepNumber: 1,
    status: "completed",
    conclusion: opts.conclusion ?? "success",
    durationMs: opts.durationMs,
  };
}

Deno.test("computeDeltas: first execution has null delta", () => {
  const out = computeDeltas([make({ runId: 1, durationMs: 1000 })]);
  assertEquals(out[0]?.deltaMsFromPrevious, null);
});

Deno.test("computeDeltas: delta vs previous successful same-branch", () => {
  const out = computeDeltas([
    make({ runId: 1, durationMs: 1000 }),
    make({ runId: 2, durationMs: 1500 }),
    make({ runId: 3, durationMs: 1200 }),
  ]);
  assertEquals(out.map((e) => e.deltaMsFromPrevious), [null, 500, -300]);
});

Deno.test("computeDeltas: failed run is excluded from baseline", () => {
  const out = computeDeltas([
    make({ runId: 1, durationMs: 1000 }),
    make({ runId: 2, durationMs: 9999, conclusion: "failure" }),
    make({ runId: 3, durationMs: 1100 }),
  ]);
  assertEquals(out[2]?.deltaMsFromPrevious, 100);
  assertEquals(out[1]?.deltaMsFromPrevious, 8999);
});

Deno.test("computeDeltas: skipped run gets null delta and is skipped as baseline", () => {
  const out = computeDeltas([
    make({ runId: 1, durationMs: 1000 }),
    make({ runId: 2, durationMs: null, conclusion: "skipped" }),
    make({ runId: 3, durationMs: 1100 }),
  ]);
  assertEquals(out[1]?.deltaMsFromPrevious, null);
  assertEquals(out[2]?.deltaMsFromPrevious, 100);
});

Deno.test("computeDeltas: cross-branch runs are excluded from baseline", () => {
  const out = computeDeltas([
    make({ runId: 1, branch: "main", durationMs: 1000 }),
    make({ runId: 2, branch: "feature/x", durationMs: 5000 }),
    make({ runId: 3, branch: "main", durationMs: 1100 }),
  ]);
  assertEquals(out[1]?.deltaMsFromPrevious, null);
  assertEquals(out[2]?.deltaMsFromPrevious, 100);
});

Deno.test("computeDeltas: no matching prior yields null delta", () => {
  const out = computeDeltas([
    make({ runId: 1, branch: "feature/x", durationMs: 1000 }),
    make({ runId: 2, branch: "main", durationMs: 1500 }),
  ]);
  assertEquals(out.map((e) => e.deltaMsFromPrevious), [null, null]);
});

Deno.test("computeDeltas: in-flight null-duration run skipped from baseline", () => {
  const out = computeDeltas([
    make({ runId: 1, durationMs: 1000 }),
    make({ runId: 2, durationMs: null }),
    make({ runId: 3, durationMs: 1050 }),
  ]);
  assertEquals(out[1]?.deltaMsFromPrevious, null);
  assertEquals(out[2]?.deltaMsFromPrevious, 50);
});
