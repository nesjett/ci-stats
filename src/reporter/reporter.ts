import type { ReportData } from "../domain/types.ts";

export interface ReporterContext {
  readonly stdout: WritableStream<Uint8Array>;
  readonly stderr: WritableStream<Uint8Array>;
  readonly now: () => Date;
  readonly color: boolean;
  readonly options: Readonly<Record<string, string | boolean | number>>;
}

export interface Reporter {
  readonly name: string;
  render(data: ReportData, ctx: ReporterContext): Promise<void>;
}

export type ReporterFactory = () => Reporter;
