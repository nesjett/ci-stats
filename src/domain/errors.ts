export abstract class AppError extends Error {
  abstract readonly code: number;
}

export class InvalidArgsError extends AppError {
  readonly code = 2;
}

export class UnknownReporterError extends AppError {
  readonly code = 3;
  constructor(name: string, available: readonly string[]) {
    super(`unknown reporter "${name}". Available: ${available.join(", ")}`);
  }
}

export class GhNotInstalledError extends AppError {
  readonly code = 10;
  constructor() {
    super(
      "`gh` CLI not found on PATH. Install from https://cli.github.com/, then run `gh auth login`.",
    );
  }
}

export class GhNotAuthenticatedError extends AppError {
  readonly code = 11;
  constructor(detail?: string) {
    super(`gh is not authenticated. Run: gh auth login${detail ? `\n${detail}` : ""}`);
  }
}

export class GhInvocationError extends AppError {
  readonly code = 12;
  constructor(args: readonly string[], exitCode: number, stderr: string) {
    super(`gh ${args.join(" ")} exited ${exitCode}: ${stderr.trim()}`);
  }
}

export class WorkflowNotFoundError extends AppError {
  readonly code = 20;
  constructor(file: string) {
    super(`workflow file not found: ${file}`);
  }
}
