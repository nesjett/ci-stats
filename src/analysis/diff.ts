import type { StepExecution } from "../domain/types.ts";

type RawExecution = Omit<StepExecution, "deltaMsFromPrevious">;

/**
 * Given a chronologically-ordered (oldest → newest) series of executions of a single
 * (jobName, stepNumber, stepName) identity, attach `deltaMsFromPrevious`.
 *
 * Baseline for delta: the nearest prior execution that
 *   - has `conclusion === "success"`
 *   - shares the same `headBranch`
 *   - has a non-null `durationMs`
 *
 * First-in-series, skipped, in-flight, or no matching prior → null delta.
 */
export function computeDeltas(executions: readonly RawExecution[]): StepExecution[] {
  const result: StepExecution[] = [];
  for (let i = 0; i < executions.length; i++) {
    const curr = executions[i]!;
    const delta = curr.durationMs === null ? null : findBaseline(executions, i, curr.headBranch);
    result.push({ ...curr, deltaMsFromPrevious: delta });
  }
  return result;
}

function findBaseline(
  executions: readonly RawExecution[],
  currentIndex: number,
  branch: string,
): number | null {
  const current = executions[currentIndex]!;
  if (current.durationMs === null) return null;
  for (let j = currentIndex - 1; j >= 0; j--) {
    const prev = executions[j]!;
    if (
      prev.conclusion === "success" &&
      prev.headBranch === branch &&
      prev.durationMs !== null
    ) {
      return current.durationMs - prev.durationMs;
    }
  }
  return null;
}
