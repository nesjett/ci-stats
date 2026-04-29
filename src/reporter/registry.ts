import { UnknownReporterError } from "../domain/errors.ts";
import type { ReporterFactory } from "./reporter.ts";
import { tableReporter } from "./table/mod.ts";

const builtins: Readonly<Record<string, ReporterFactory>> = {
  table: tableReporter,
};

export function resolveReporter(name: string): ReporterFactory {
  const factory = builtins[name];
  if (!factory) throw new UnknownReporterError(name, Object.keys(builtins));
  return factory;
}

export function listReporters(): readonly string[] {
  return Object.keys(builtins);
}
