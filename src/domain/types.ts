export type RunStatus = "queued" | "in_progress" | "completed";

export type Conclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral";

export interface WorkflowRun {
  readonly runId: number;
  readonly runNumber: number;
  readonly attempt: number;
  readonly headSha: string;
  readonly headBranch: string;
  readonly event: string;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly pullRequestNumbers: readonly number[];
  readonly jobs: readonly Job[];
}

export interface Job {
  readonly jobId: number;
  readonly name: string;
  readonly htmlUrl: string;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly steps: readonly Step[];
}

export interface Step {
  readonly name: string;
  readonly number: number;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
}

export interface StepExecution {
  readonly runId: number;
  readonly runNumber: number;
  readonly runHtmlUrl: string;
  readonly runCreatedAt: string;
  readonly headSha: string;
  readonly headBranch: string;
  readonly attempt: number;
  readonly stepNumber: number;
  readonly status: RunStatus;
  readonly conclusion: Conclusion | null;
  readonly durationMs: number | null;
  readonly deltaMsFromPrevious: number | null;
}

export interface StepGroup {
  readonly stepName: string;
  readonly executions: readonly StepExecution[];
}

export interface JobGroup {
  readonly jobName: string;
  readonly steps: readonly StepGroup[];
}

export interface ReportData {
  readonly repo: { readonly owner: string; readonly name: string };
  readonly workflow: {
    readonly file: string;
    readonly id: number | null;
    readonly name: string | null;
  };
  readonly filter: {
    readonly pullRequest: number | null;
    readonly limit: number;
    readonly includeReruns: boolean;
  };
  readonly generatedAt: string;
  readonly runCount: number;
  readonly jobs: readonly JobGroup[];
}
