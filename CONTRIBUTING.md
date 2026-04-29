# Contributing

Thanks for helping out. A few conventions keep the release flow and CI tidy.

## Conventional commits

Commit messages and **PR titles** follow
[Conventional Commits](https://www.conventionalcommits.org/). `release-please` parses them to decide
the next version:

| Prefix                                                                  | Version bump |
| ----------------------------------------------------------------------- | ------------ |
| `fix: …`                                                                | patch        |
| `feat: …`                                                               | minor        |
| `feat!: …` / `fix!: …` / any commit with `BREAKING CHANGE:` in the body | major        |
| `chore:`, `docs:`, `ci:`, `test:`, `refactor:`, `style:`                | no bump      |

Pre-1.0 (0.x) we keep `bump-minor-pre-major` on, so `feat:` bumps the minor and breaking changes
bump the minor (not the major).

> The repo is configured to **squash-merge with PR title as commit message**. If your PR title is
> not conventional-commit, `release-please` won't see your change.

## Development

```sh
deno run --allow-run=gh --allow-env src/main.ts -w ci.yml --pr 1   # run the CLI in dev mode
deno task mcp                    # run the MCP server over stdio (for coding-agent integration)
deno task test                   # run unit + integration tests (no network)
deno task check                  # typecheck src + tests
deno task lint                   # deno lint
deno task fmt                    # apply formatter
deno task compile                # produce dist/gh-workflow-explorer for the current host
deno task compile:mcp            # produce dist/gh-workflow-explorer-mcp (the MCP binary)
```

CI must pass before merge: `fmt --check`, `lint`, `check`, `test`, and a Linux compile smoke.

## MCP server architecture

The MCP server lives under `src/mcp/` and exposes the existing `buildReport` core to coding agents
(Claude Code, Cursor, etc.) via stdio JSON-RPC. It does **not** spawn or shell out to the CLI
binary; it imports `buildReport` directly so there is one code path and one schema.

```
src/mcp/
├── main.ts        stdio entrypoint — logs to stderr only (stdout is JSON-RPC)
├── server.ts      createServer(deps) — wires McpServer + tool registration
├── tools.ts       registerTools — handler that calls buildReport, maps errors
└── schema.ts      Zod input shape for `get_workflow_report`
```

The tool returns the **same** envelope (`{schema:"gh-workflow-explorer/v1", generatedBy, data}`) the
JSON reporter emits. Both share `src/reporter/json/envelope.ts` so the schema cannot drift.

`AppError` instances surface as `isError: true` tool results carrying `{kind, code, message}`,
mirroring the CLI's exit codes. Non-`AppError` exceptions log the stack to stderr and surface as a
generic `InternalError`.

Set `MCP_VERBOSE=1` to enable debug logging on stderr and include stack traces in error payloads.

## Adding a new reporter

1. Create `src/reporter/<name>.ts` exporting a `ReporterFactory`.
2. Register it in `src/reporter/registry.ts`:
   ```ts
   const builtins: Readonly<Record<string, ReporterFactory>> = {
     table: tableReporter,
     json: jsonReporter, // <-- add here
   };
   ```
3. Add a golden-file test in `tests/reporter/<name>_test.ts` asserting output against a fixture.

Reporters consume `ReportData` and nothing else — they never touch `gh` or the filesystem unless
they have a reason to.

## End-to-end fixture workflow

`.github/workflows/explorer-fixture.yml` is a synthetic CI workflow that exists purely to give the
explorer something rich to render against the live API: many jobs, a 2×2 matrix, conditional skips,
an intentionally flaky job, a reusable workflow call, and a `heavy` job with 20 steps to exercise
horizontal pagination. It is gated on `paths:` so it only runs when the fixture itself changes, plus
`workflow_dispatch` for manual triggering. To produce sample data:

```sh
gh workflow run explorer-fixture.yml --ref <branch>
# wait for runs to finish, then:
gh-workflow-explorer -w explorer-fixture.yml --pr <PR-number>
```

Edit the fixture when you need to verify a new edge case end-to-end.

## Tests

- **Unit tests** live in `tests/<module>/`. They must not touch the network.
- **Fixtures** live in `tests/fixtures/`. They are real `gh ... --json` captures; re-record them
  occasionally to stay current.
- No live-API tests in CI. A manual integration test can be run with `INTEGRATION=1 deno test` once
  that suite exists.

## Releasing

You don't release manually. `release-please` opens a PR against `main` whenever unreleased
conventional commits exist. Merging that PR:

1. Creates a git tag and a GitHub Release.
2. Triggers the `compile` matrix which builds binaries for all five target triples and uploads them
   to the release.
