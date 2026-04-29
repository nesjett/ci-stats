import { z } from "zod";

export const getWorkflowReportInputShape = {
  workflow: z.string().min(1).describe('Workflow filename, e.g. "ci.yml"'),
  repo: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/, "must be <owner>/<name>")
    .optional()
    .describe("Target repo as <owner>/<name>. Defaults to the current `gh` repo."),
  pullRequest: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Filter to runs linked to this PR number."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max runs after filtering (1..100)."),
  includeReruns: z
    .boolean()
    .default(false)
    .describe("Include non-final run attempts."),
};

export type GetWorkflowReportInput = z.infer<z.ZodObject<typeof getWorkflowReportInputShape>>;
