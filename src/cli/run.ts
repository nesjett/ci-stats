import { parseCliArgs, parseRepo } from "./args.ts";
import { helpText } from "./help.ts";
import { AppError } from "../domain/errors.ts";
import { RealGhClient } from "../gh/client.ts";
import { buildReport, resolveRepo } from "../gh/fetch.ts";
import { resolveReporter } from "../reporter/registry.ts";
import { createLogger } from "../util/log.ts";
import { VERSION } from "../../version.ts";

const ENV: { get(name: string): string | undefined } = {
  get(name: string): string | undefined {
    try {
      return Deno.env.get(name) ?? undefined;
    } catch {
      return undefined;
    }
  },
};

export async function run(argv: readonly string[]): Promise<number> {
  let opts;
  try {
    opts = parseCliArgs(argv, ENV);
  } catch (e) {
    return fail(e);
  }

  if (opts.showVersion) {
    await writeStdout(`${VERSION}\n`);
    return 0;
  }
  if (opts.showHelp) {
    await writeStdout(helpText());
    return 0;
  }

  const logger = createLogger(opts.verbose);
  const gh = new RealGhClient();

  try {
    const requested = parseRepo(opts.repo);
    const repo = requested ?? await resolveRepo(gh);
    const report = await buildReport(gh, {
      owner: repo.owner,
      repo: repo.name,
      workflowFile: opts.workflow,
      pullRequest: opts.pullRequest,
      limit: opts.limit,
      includeReruns: opts.includeReruns,
      concurrency: 5,
      logger,
    });
    const reporter = resolveReporter(opts.reporter)();
    await reporter.render(report, {
      stdout: Deno.stdout.writable,
      stderr: Deno.stderr.writable,
      now: () => new Date(),
      color: opts.color,
      options: {},
    });
    return 0;
  } catch (e) {
    return fail(e);
  }
}

async function writeStdout(s: string): Promise<void> {
  await Deno.stdout.write(new TextEncoder().encode(s));
}

async function writeStderr(s: string): Promise<void> {
  await Deno.stderr.write(new TextEncoder().encode(s));
}

async function fail(e: unknown): Promise<number> {
  if (e instanceof AppError) {
    await writeStderr(`error: ${e.message}\n`);
    return e.code;
  }
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  await writeStderr(`unexpected error: ${msg}\n`);
  return 1;
}
