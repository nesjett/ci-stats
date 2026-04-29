import type { ReportData } from "../../domain/types.ts";
import type { ReporterContext, ReporterFactory } from "../reporter.ts";
import { buildEnvelope } from "./envelope.ts";

export const jsonReporter: ReporterFactory = () => ({
  name: "json",
  async render(data: ReportData, ctx: ReporterContext) {
    const json = JSON.stringify(buildEnvelope(data));
    const writer = ctx.stdout.getWriter();
    try {
      await writer.write(new TextEncoder().encode(json + "\n"));
    } finally {
      writer.releaseLock();
    }
  },
});
