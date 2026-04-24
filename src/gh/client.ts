import {
  GhInvocationError,
  GhNotAuthenticatedError,
  GhNotInstalledError,
} from "../domain/errors.ts";

export interface GhResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export interface GhClient {
  run(args: readonly string[]): Promise<GhResult>;
}

export class RealGhClient implements GhClient {
  async run(args: readonly string[]): Promise<GhResult> {
    let cmd: Deno.Command;
    try {
      cmd = new Deno.Command("gh", {
        args: [...args],
        stdout: "piped",
        stderr: "piped",
      });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) throw new GhNotInstalledError();
      throw e;
    }

    let output: Deno.CommandOutput;
    try {
      output = await cmd.output();
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) throw new GhNotInstalledError();
      throw e;
    }

    return {
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      code: output.code,
    };
  }
}

export async function ghApi<T = unknown>(
  gh: GhClient,
  path: string,
  opts: { paginate?: boolean } = {},
): Promise<T> {
  const args = ["api", path];
  if (opts.paginate) args.push("--paginate");
  const { stdout, stderr, code } = await gh.run(args);
  if (code !== 0) throw new GhInvocationError(args, code, stderr);
  return parsePossiblyPaginatedJson<T>(stdout);
}

/**
 * `gh api --paginate` concatenates JSON arrays without commas (one `[...]` per page).
 * For object responses with a list field, `gh` splices the arrays together correctly.
 * We handle both shapes.
 */
function parsePossiblyPaginatedJson<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (!trimmed) return [] as unknown as T;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const pages = trimmed.split(/\]\s*\[/).map((chunk, i, arr) => {
      if (i === 0 && arr.length > 1) return chunk + "]";
      if (i === arr.length - 1 && arr.length > 1) return "[" + chunk;
      return "[" + chunk + "]";
    });
    const merged: unknown[] = [];
    for (const page of pages) merged.push(...(JSON.parse(page) as unknown[]));
    return merged as unknown as T;
  }
}

export async function assertAuthenticated(gh: GhClient): Promise<void> {
  const { stdout, stderr, code } = await gh.run(["auth", "status"]);
  if (code !== 0) throw new GhNotAuthenticatedError((stderr || stdout).trim());
}
