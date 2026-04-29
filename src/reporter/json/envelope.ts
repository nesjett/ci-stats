import type { ReportData } from "../../domain/types.ts";

// Bump only on breaking changes; additive fields stay on v1.
const SCHEMA = "gh-workflow-explorer/v1";

interface ReportEnvelope {
  readonly schema: string;
  readonly generatedBy: string;
  readonly data: unknown;
}

export function buildEnvelope(data: ReportData): ReportEnvelope {
  return {
    schema: SCHEMA,
    generatedBy: "gh-workflow-explorer",
    data: enrich(data),
  };
}

function enrich(data: ReportData): unknown {
  return {
    ...data,
    jobs: data.jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step) => ({
        ...step,
        id: `${job.jobName}::${step.stepName}`,
        executions: step.executions.map((e) => ({
          ...e,
          id: `${e.runId}-${e.attempt}-${e.stepNumber}`,
        })),
      })),
    })),
  };
}
