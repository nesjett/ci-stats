import type { JobGroup, ReportData, WorkflowRun } from "../domain/types.ts";
import { RepoNotResolvedError, WorkflowNotFoundError } from "../domain/errors.ts";
import { assertAuthenticated, ghApi, type GhClient } from "./client.ts";
import { type JobsPayload, mapJobs, mapRunMeta, type RunsListPayload } from "./mapping.ts";
import { groupByJobAndStep } from "../analysis/group.ts";
import type { Logger } from "../util/log.ts";

export interface FetchOptions {
  readonly owner: string;
  readonly repo: string;
  readonly workflowFile: string;
  readonly pullRequest: number | null;
  readonly limit: number;
  readonly includeReruns: boolean;
  readonly concurrency: number;
  readonly logger: Logger;
}

const CONCURRENCY_DEFAULT = 5;

export async function resolveRepo(gh: GhClient): Promise<{ owner: string; name: string }> {
  const out = await gh.run(["repo", "view", "--json", "nameWithOwner"]);
  if (out.code !== 0) {
    throw new RepoNotResolvedError(out.stderr.trim() || "no stderr");
  }
  const parsed = JSON.parse(out.stdout) as { nameWithOwner: string };
  const [owner, name] = parsed.nameWithOwner.split("/");
  if (!owner || !name) {
    throw new RepoNotResolvedError(`unexpected nameWithOwner: ${parsed.nameWithOwner}`);
  }
  return { owner, name };
}

async function resolvePrShas(
  gh: GhClient,
  owner: string,
  repo: string,
  pr: number,
): Promise<Set<string>> {
  const args = [
    "pr",
    "view",
    String(pr),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "headRefOid,commits",
  ];
  const out = await gh.run(args);
  if (out.code !== 0) {
    throw new Error(`failed to resolve PR #${pr}: ${out.stderr.trim() || "no stderr"}`);
  }
  const parsed = JSON.parse(out.stdout) as {
    headRefOid?: string;
    commits?: ReadonlyArray<{ oid: string }>;
  };
  const shas = new Set<string>();
  if (parsed.headRefOid) shas.add(parsed.headRefOid);
  for (const c of parsed.commits ?? []) shas.add(c.oid);
  return shas;
}

export async function buildReport(gh: GhClient, opts: FetchOptions): Promise<ReportData> {
  await assertAuthenticated(gh);
  const { owner, repo, workflowFile, pullRequest, limit, includeReruns, logger } = opts;

  const filterDescription = pullRequest !== null ? ` (PR #${pullRequest})` : "";
  logger.debug(
    `fetching runs for workflow ${workflowFile} in ${owner}/${repo}${filterDescription}`,
  );
  const overFetch = pullRequest !== null ? Math.max(limit * 3, 30) : limit;
  const listPath = `repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs` +
    `?per_page=${Math.min(overFetch, 100)}`;
  let listResp: RunsListPayload;
  try {
    listResp = await ghApi<RunsListPayload>(gh, listPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404|Not Found/i.test(msg)) throw new WorkflowNotFoundError(workflowFile);
    throw e;
  }

  const runsMeta = listResp.workflow_runs.map(mapRunMeta);
  let filtered = runsMeta;
  if (pullRequest !== null) {
    const prShas = await resolvePrShas(gh, owner, repo, pullRequest);
    logger.debug(`resolved ${prShas.size} commit SHA(s) for PR #${pullRequest}`);
    filtered = runsMeta.filter((r) =>
      r.pullRequestNumbers.includes(pullRequest) || prShas.has(r.headSha)
    );
  }
  const limited = filtered.slice(0, limit);
  logger.debug(
    `fetched ${runsMeta.length} runs; ${filtered.length} match filter; ${limited.length} after limit`,
  );

  const runs = await fetchJobsForRuns(
    gh,
    owner,
    repo,
    limited,
    includeReruns,
    opts.concurrency ?? CONCURRENCY_DEFAULT,
    logger,
  );

  const chronological = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const jobs: readonly JobGroup[] = groupByJobAndStep(chronological);

  return {
    repo: { owner, name: repo },
    workflow: { file: workflowFile, id: null, name: null },
    filter: { pullRequest, limit, includeReruns },
    generatedAt: new Date().toISOString(),
    runCount: chronological.length,
    jobs,
  };
}

async function fetchJobsForRuns(
  gh: GhClient,
  owner: string,
  repo: string,
  runs: readonly Omit<WorkflowRun, "jobs">[],
  includeReruns: boolean,
  concurrency: number,
  logger: Logger,
): Promise<WorkflowRun[]> {
  const tasks: WorkflowRun[] = new Array(runs.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= runs.length) return;
      const run = runs[i]!;
      const path = includeReruns
        ? `repos/${owner}/${repo}/actions/runs/${run.runId}/attempts/${run.attempt}/jobs`
        : `repos/${owner}/${repo}/actions/runs/${run.runId}/jobs`;
      logger.debug(`GET ${path}`);
      const payload = await ghApi<JobsPayload>(gh, path);
      tasks[i] = { ...run, jobs: mapJobs(payload.jobs) };
    }
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
  await Promise.all(workers);
  return tasks;
}
