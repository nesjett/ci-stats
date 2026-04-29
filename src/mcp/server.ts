import { McpServer } from "@mcp/server";
import { VERSION } from "../../version.ts";
import { registerTools, type ToolDeps } from "./tools.ts";

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({
    name: "gh-workflow-explorer",
    version: VERSION,
  });
  registerTools(server, deps);
  return server;
}
