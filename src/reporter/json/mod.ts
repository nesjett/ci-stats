import type { ReportData } from "../../domain/types.ts";
import type { ReporterContext, ReporterFactory } from "../reporter.ts";

/**
 * Stable schema discriminator. Bump on breaking changes only — additive fields stay on v1.
 * Consumers must ignore unknown keys.
 */
const SCHEMA = "gh-workflow-explorer/v1";

/**
 * Emits the report as compact JSON, suitable for AI agents and downstream tooling.
 * Output shape:
 *
 *   { schema, generatedBy, data: ReportData (with synthetic `id` fields on
 *     each StepGroup and StepExecution to act as stable join keys) }
 *
 * Compact (no whitespace) + trailing newline. Pipe to `jq` if you want it indented.
 * `ctx.color` is ignored — JSON is data, not styled text.
 */
export const jsonReporter: ReporterFactory = () => ({
  name: "json",
  async render(data: ReportData, ctx: ReporterContext) {
    const payload = {
      schema: SCHEMA,
      generatedBy: "gh-workflow-explorer",
      data: enrich(data),
    };
    const json = JSON.stringify(payload);
    const writer = ctx.stdout.getWriter();
    try {
      await writer.write(new TextEncoder().encode(json + "\n"));
    } finally {
      writer.releaseLock();
    }
  },
});

function enrich(data: ReportData): unknown {
  return {
    ...data,
    jobs: data.jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step) => ({
        id: `${job.jobName}::${step.stepName}`,
        ...step,
        executions: step.executions.map((e) => ({
          id: `${e.runId}-${e.attempt}-${e.stepNumber}`,
          ...e,
        })),
      })),
    })),
  };
}
