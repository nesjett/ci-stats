import { parseArgs } from "@std/cli/parse-args";
import { InvalidArgsError } from "../domain/errors.ts";

export interface CliOptions {
  readonly workflow: string;
  readonly repo: string | null;
  readonly pullRequest: number | null;
  readonly reporter: string;
  readonly limit: number;
  readonly includeReruns: boolean;
  readonly color: boolean;
  readonly verbose: boolean;
  readonly showHelp: boolean;
  readonly showVersion: boolean;
}

export interface EnvReader {
  get(name: string): string | undefined;
}

export function parseCliArgs(argv: readonly string[], env: EnvReader): CliOptions {
  const parsed = parseArgs([...argv], {
    string: ["workflow", "repo", "pr", "reporter", "limit"],
    boolean: ["include-reruns", "no-color", "verbose", "help", "version"],
    alias: {
      w: "workflow",
      R: "repo",
      r: "reporter",
      n: "limit",
      v: "verbose",
      h: "help",
      V: "version",
    },
    default: {
      reporter: "table",
      limit: "20",
    },
  });

  const showHelp = Boolean(parsed.help);
  const showVersion = Boolean(parsed.version);
  if (showHelp || showVersion) {
    return {
      workflow: "",
      repo: null,
      pullRequest: null,
      reporter: "table",
      limit: 20,
      includeReruns: false,
      color: env.get("NO_COLOR") === undefined,
      verbose: false,
      showHelp,
      showVersion,
    };
  }

  const workflow = parsed.workflow;
  if (!workflow) throw new InvalidArgsError("missing --workflow. Run with --help.");

  const limit = parseIntOr(parsed.limit, 20, "--limit");
  if (limit <= 0) throw new InvalidArgsError("--limit must be positive");

  const pullRequest = parsed.pr !== undefined ? parseIntOr(parsed.pr, NaN, "--pr") : null;
  if (pullRequest !== null && !Number.isFinite(pullRequest)) {
    throw new InvalidArgsError("--pr must be an integer");
  }

  const envNoColor = env.get("NO_COLOR") !== undefined;
  const color = !envNoColor && !parsed["no-color"];

  return {
    workflow,
    repo: parsed.repo ?? null,
    pullRequest,
    reporter: parsed.reporter ?? "table",
    limit,
    includeReruns: Boolean(parsed["include-reruns"]),
    color,
    verbose: Boolean(parsed.verbose),
    showHelp: false,
    showVersion: false,
  };
}

function parseIntOr(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) throw new InvalidArgsError(`${flag} must be an integer`);
  return n;
}

export function parseRepo(repo: string | null): { owner: string; name: string } | null {
  if (!repo) return null;
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new InvalidArgsError(`--repo must be <owner>/<name> (got "${repo}")`);
  return { owner, name };
}
