import type { Conclusion, Job, RunStatus, Step, WorkflowRun } from "../domain/types.ts";
import { durationMs } from "../util/time.ts";

interface RawRun {
  readonly id: number;
  readonly name?: string;
  readonly run_number: number;
  readonly run_attempt?: number;
  readonly event: string;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly head_branch: string;
  readonly head_sha: string;
  readonly html_url: string;
  readonly created_at: string;
  readonly pull_requests?: ReadonlyArray<{ number: number }>;
}

interface RawJob {
  readonly id: number;
  readonly run_id: number;
  readonly run_attempt?: number;
  readonly name: string;
  readonly html_url: string;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly steps?: readonly RawStep[];
}

interface RawStep {
  readonly name: string;
  readonly number: number;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
}

export interface RunsListPayload {
  readonly total_count: number;
  readonly workflow_runs: readonly RawRun[];
}

export interface JobsPayload {
  readonly total_count: number;
  readonly jobs: readonly RawJob[];
}

export function mapRunMeta(raw: RawRun): Omit<WorkflowRun, "jobs"> {
  return {
    runId: raw.id,
    runNumber: raw.run_number,
    attempt: raw.run_attempt ?? 1,
    headSha: raw.head_sha,
    headBranch: raw.head_branch,
    event: raw.event,
    status: raw.status,
    conclusion: raw.conclusion,
    htmlUrl: raw.html_url,
    createdAt: raw.created_at,
    pullRequestNumbers: (raw.pull_requests ?? []).map((p) => p.number),
  };
}

export function mapJobs(jobs: readonly RawJob[]): Job[] {
  return jobs.map(mapJob);
}

function mapJob(raw: RawJob): Job {
  const steps: Step[] = [...(raw.steps ?? [])]
    .sort((a, b) => a.number - b.number)
    .map(mapStep);
  return {
    jobId: raw.id,
    name: raw.name,
    htmlUrl: raw.html_url,
    status: raw.status,
    conclusion: raw.conclusion,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    durationMs: durationMs(raw.started_at, raw.completed_at),
    steps,
  };
}

function mapStep(raw: RawStep): Step {
  return {
    name: raw.name,
    number: raw.number,
    status: raw.status,
    conclusion: raw.conclusion,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    durationMs: durationMs(raw.started_at, raw.completed_at),
  };
}
