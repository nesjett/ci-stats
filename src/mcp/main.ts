// stdio MCP: stdout is JSON-RPC only — log to stderr (see src/util/log.ts).
import { StdioServerTransport } from "@mcp/stdio";
import { RealGhClient } from "../gh/client.ts";
import { createLogger } from "../util/log.ts";
import { createServer } from "./server.ts";

function reportFatal(prefix: string, e: unknown): void {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  try {
    Deno.stderr.writeSync(new TextEncoder().encode(`${prefix}: ${msg}\n`));
  } catch {
    // stderr already gone — nothing useful we can do.
  }
}

if (import.meta.main) {
  const verbose = isTruthy(Deno.env.get("MCP_VERBOSE"));
  const server = createServer({
    gh: new RealGhClient(),
    logger: createLogger(verbose),
  });

  globalThis.addEventListener("unhandledrejection", (event) => {
    reportFatal("mcp server unhandled rejection", event.reason);
    Deno.exit(1);
  });

  try {
    await server.connect(new StdioServerTransport());
  } catch (e) {
    reportFatal("mcp server fatal", e);
    Deno.exit(1);
  }
}

function isTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
