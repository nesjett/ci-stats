import type { McpServer } from "@mcp/server";
import { parseRepo } from "../cli/args.ts";
import { AppError } from "../domain/errors.ts";
import { buildReport, resolveRepo } from "../gh/fetch.ts";
import type { GhClient } from "../gh/client.ts";
import { buildEnvelope } from "../reporter/json/envelope.ts";
import type { Logger } from "../util/log.ts";
import { type GetWorkflowReportInput, getWorkflowReportInputShape } from "./schema.ts";

export interface ToolDeps {
  readonly gh: GhClient;
  readonly logger: Logger;
}

export interface ToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly isError?: boolean;
}

const FETCH_CONCURRENCY = 5;

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "get_workflow_report",
    {
      title: "Get GitHub Actions workflow report",
      description:
        "Fetch recent runs of a GitHub Actions workflow and return a per-job, per-step execution matrix with durations and deltas vs the previous successful run on the same branch. Returns the same JSON envelope as `gh-workflow-explorer -r json`. Requires the local `gh` CLI to be installed and authenticated.",
      inputSchema: getWorkflowReportInputShape,
    },
    (input: GetWorkflowReportInput) => handleGetWorkflowReport(input, deps),
  );
}

async function handleGetWorkflowReport(
  input: GetWorkflowReportInput,
  deps: ToolDeps,
): Promise<ToolResult> {
  try {
    const requested = parseRepo(input.repo ?? null);
    const repo = requested ?? await resolveRepo(deps.gh);
    const data = await buildReport(deps.gh, {
      owner: repo.owner,
      repo: repo.name,
      workflowFile: input.workflow,
      pullRequest: input.pullRequest ?? null,
      limit: input.limit,
      includeReruns: input.includeReruns,
      concurrency: FETCH_CONCURRENCY,
      logger: deps.logger,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(buildEnvelope(data)) }],
    };
  } catch (e) {
    return toolError(e, deps.logger);
  }
}

function toolError(e: unknown, logger: Logger): ToolResult {
  if (e instanceof AppError) {
    return errorResult({ kind: e.constructor.name, code: e.code, message: e.message });
  }
  // Surface non-AppError to the host operator — a bug, not a user-facing condition.
  logger.info(`tool internal error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  const payload: Record<string, unknown> = {
    kind: "InternalError",
    message: e instanceof Error ? e.message : String(e),
  };
  if (debugEnabled() && e instanceof Error && e.stack) payload.stack = e.stack;
  return errorResult(payload);
}

function errorResult(payload: Record<string, unknown>): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: payload }) }],
  };
}

function debugEnabled(): boolean {
  try {
    return Deno.env.get("MCP_VERBOSE") !== undefined;
  } catch {
    return false;
  }
}
