import { assertEquals, assertStringIncludes } from "@std/assert";
import { InMemoryTransport } from "@mcp/in-memory";
import { Client } from "@mcp/client";
import { createServer } from "../../src/mcp/server.ts";
import type { GhClient, GhResult } from "../../src/gh/client.ts";
import { FakeGhClient, loadFixture } from "../fake_gh.ts";

interface CallToolText {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly isError?: boolean;
}

const SILENT_LOGGER = { info: () => {}, debug: () => {} };

async function buildFakeGh(): Promise<FakeGhClient> {
  const responses = new Map<string, GhResult | string>();
  responses.set("auth status", { stdout: "Logged in.", stderr: "", code: 0 });
  responses.set(
    "repo view --json nameWithOwner",
    JSON.stringify({ nameWithOwner: "acme/app" }),
  );
  responses.set(
    "api repos/acme/app/actions/workflows/ci.yml/runs?per_page=20",
    await loadFixture("runs_list.json"),
  );
  for (const id of [1001, 1002, 1003]) {
    responses.set(
      `api repos/acme/app/actions/runs/${id}/jobs`,
      await loadFixture(`run_jobs_${id}.json`),
    );
  }
  return new FakeGhClient(responses);
}

async function withConnectedClient(
  gh: GhClient,
  fn: (client: Client) => Promise<void>,
): Promise<void> {
  const server = createServer({ gh, logger: SILENT_LOGGER });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  try {
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

Deno.test("MCP server: tools/list exposes get_workflow_report", async () => {
  const gh = await buildFakeGh();
  await withConnectedClient(gh, async (client) => {
    const { tools } = await client.listTools() as {
      tools: Array<{ name: string; description?: string }>;
    };
    const tool = tools.find((t) => t.name === "get_workflow_report")!;
    assertEquals(tool.name, "get_workflow_report");
    assertStringIncludes(tool.description ?? "", "GitHub Actions");
  });
});

Deno.test("MCP server: get_workflow_report returns the v1 envelope", async () => {
  const gh = await buildFakeGh();
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "ci.yml", repo: "acme/app" },
    })) as CallToolText;
    assertEquals(result.isError ?? false, false);
    assertEquals(result.content.length, 1);
    const block = result.content[0]!;
    assertEquals(block.type, "text");
    const parsed = JSON.parse(block.text!);
    assertEquals(parsed.schema, "gh-workflow-explorer/v1");
    assertEquals(parsed.generatedBy, "gh-workflow-explorer");
    assertEquals(parsed.data.repo, { owner: "acme", name: "app" });
    assertEquals(parsed.data.workflow.file, "ci.yml");
    assertEquals(parsed.data.runCount, 3);
    assertEquals(parsed.data.filter, {
      pullRequest: null,
      limit: 20,
      includeReruns: false,
    });
  });
});

Deno.test("MCP server: defaults repo via `gh repo view` when omitted", async () => {
  const gh = await buildFakeGh();
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "ci.yml" },
    })) as CallToolText;
    assertEquals(result.isError ?? false, false);
    const calls = gh.calls.map((c) => c.join(" "));
    assertEquals(calls.includes("repo view --json nameWithOwner"), true);
  });
});

Deno.test("MCP server: maps gh-not-authenticated to isError with code 11", async () => {
  const responses = new Map<string, GhResult | string>();
  responses.set("auth status", {
    stdout: "",
    stderr: "You are not logged into any GitHub hosts.",
    code: 1,
  });
  const gh = new FakeGhClient(responses);
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "ci.yml", repo: "acme/app" },
    })) as CallToolText;
    assertEquals(result.isError, true);
    const parsed = JSON.parse(result.content[0]!.text!);
    assertEquals(parsed.error.kind, "GhNotAuthenticatedError");
    assertEquals(parsed.error.code, 11);
  });
});

Deno.test("MCP server: maps workflow-not-found to isError with code 20", async () => {
  const responses = new Map<string, GhResult | string>();
  responses.set("auth status", { stdout: "Logged in.", stderr: "", code: 0 });
  responses.set("api repos/acme/app/actions/workflows/missing.yml/runs?per_page=20", {
    stdout: "",
    stderr: "HTTP 404: Not Found",
    code: 1,
  });
  const gh = new FakeGhClient(responses);
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "missing.yml", repo: "acme/app" },
    })) as CallToolText;
    assertEquals(result.isError, true);
    const parsed = JSON.parse(result.content[0]!.text!);
    assertEquals(parsed.error.kind, "WorkflowNotFoundError");
    assertEquals(parsed.error.code, 20);
  });
});

Deno.test("MCP server: rejects malformed repo before calling gh", async () => {
  const gh = new FakeGhClient(new Map());
  await withConnectedClient(gh, async (client) => {
    // SDK may surface validation as throw or isError; gh must not be called either way.
    let surfaced = false;
    try {
      const result = (await client.callTool({
        name: "get_workflow_report",
        arguments: { workflow: "ci.yml", repo: "not-a-valid-repo" },
      })) as CallToolText;
      if (result.isError) {
        surfaced = true;
        assertStringIncludes(JSON.stringify(result.content), "owner");
      }
    } catch (e) {
      surfaced = true;
      assertStringIncludes(String((e as Error).message ?? e), "owner");
    }
    assertEquals(surfaced, true);
    assertEquals(gh.calls.length, 0);
  });
});

Deno.test("MCP server: pullRequest filter triggers `gh pr view` and over-fetches", async () => {
  const responses = new Map<string, GhResult | string>();
  responses.set("auth status", { stdout: "Logged in.", stderr: "", code: 0 });
  // pr=42 → over-fetch is max(20*3, 30) = 60.
  responses.set(
    "api repos/acme/app/actions/workflows/ci.yml/runs?per_page=60",
    await loadFixture("runs_list.json"),
  );
  responses.set(
    "pr view 42 --repo acme/app --json headRefOid,commits",
    JSON.stringify({ headRefOid: "bbb222", commits: [{ oid: "bbb222" }] }),
  );
  for (const id of [1001, 1002, 1003]) {
    responses.set(
      `api repos/acme/app/actions/runs/${id}/jobs`,
      await loadFixture(`run_jobs_${id}.json`),
    );
  }
  const gh = new FakeGhClient(responses);
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "ci.yml", repo: "acme/app", pullRequest: 42 },
    })) as CallToolText;
    assertEquals(result.isError ?? false, false);
    const calls = gh.calls.map((c) => c.join(" "));
    assertEquals(calls.includes("pr view 42 --repo acme/app --json headRefOid,commits"), true);
    assertEquals(
      calls.includes("api repos/acme/app/actions/workflows/ci.yml/runs?per_page=60"),
      true,
    );
    const parsed = JSON.parse(result.content[0]!.text!);
    assertEquals(parsed.data.filter.pullRequest, 42);
  });
});

Deno.test("MCP server: includeReruns switches to attempts/{n}/jobs path", async () => {
  const responses = new Map<string, GhResult | string>();
  responses.set("auth status", { stdout: "Logged in.", stderr: "", code: 0 });
  responses.set(
    "api repos/acme/app/actions/workflows/ci.yml/runs?per_page=20",
    await loadFixture("runs_list.json"),
  );
  for (const id of [1001, 1002, 1003]) {
    responses.set(
      `api repos/acme/app/actions/runs/${id}/attempts/1/jobs`,
      await loadFixture(`run_jobs_${id}.json`),
    );
  }
  const gh = new FakeGhClient(responses);
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "ci.yml", repo: "acme/app", includeReruns: true },
    })) as CallToolText;
    assertEquals(result.isError ?? false, false);
    const calls = gh.calls.map((c) => c.join(" "));
    assertEquals(
      calls.some((c) => c === "api repos/acme/app/actions/runs/1003/attempts/1/jobs"),
      true,
    );
    const parsed = JSON.parse(result.content[0]!.text!);
    assertEquals(parsed.data.filter.includeReruns, true);
  });
});

Deno.test("MCP server: maps non-AppError to InternalError isError result", async () => {
  // FakeGhClient with no responses returns a GhResult code=1, which makes
  // `assertAuthenticated` throw GhNotAuthenticatedError (an AppError) — not what
  // we want here. So override `auth status` to look healthy, then fail on
  // `repo view` with malformed JSON to provoke a SyntaxError from JSON.parse —
  // a non-AppError that the handler must encode as InternalError.
  const responses = new Map<string, GhResult | string>();
  responses.set("auth status", { stdout: "Logged in.", stderr: "", code: 0 });
  responses.set("repo view --json nameWithOwner", "this is not json");
  const gh = new FakeGhClient(responses);
  await withConnectedClient(gh, async (client) => {
    const result = (await client.callTool({
      name: "get_workflow_report",
      arguments: { workflow: "ci.yml" },
    })) as CallToolText;
    assertEquals(result.isError, true);
    const parsed = JSON.parse(result.content[0]!.text!);
    assertEquals(parsed.error.kind, "InternalError");
    assertEquals(typeof parsed.error.message, "string");
  });
});
