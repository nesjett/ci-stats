# gh-workflow-explorer

Analyze GitHub Actions workflow runs from the terminal. Given a workflow file and optionally a
pull-request number, it fetches recent runs, groups executions **per step**, and shows each step's
duration plus the **delta vs the previous successful run on the same branch** — so you can spot the
step that quietly got slower.

## Install

### Prebuilt binary

Download the archive for your platform from the
[Releases](https://github.com/nesjett/Github-workflow-explorer/releases) page, extract, and put the
binary on your `PATH`. Verify with the published `SHA256SUMS`.

> The binary is ~80 MB because it bundles the V8 runtime. This is expected; it's not your code
> weighing that much.

macOS binaries are unsigned. First run may be blocked by Gatekeeper; remove the quarantine
attribute:

```sh
xattr -d com.apple.quarantine gh-workflow-explorer
```

Windows binaries are unsigned; SmartScreen may warn on first run.

### From source

```sh
deno task compile
./dist/gh-workflow-explorer --help
```

Or run directly from source:

```sh
deno run --allow-run=gh --allow-env src/main.ts -w ci.yml
```

## Requirements

- [`gh`](https://cli.github.com/) on `PATH`, authenticated (`gh auth login`). All GitHub API calls
  are delegated to `gh`, so this tool has no tokens of its own.

## Usage

```
gh-workflow-explorer -w <workflow-file> [options]

Required:
  -w, --workflow <file>     Workflow filename (e.g. ci.yml)

Options:
  -R, --repo <owner/name>   Target repo (defaults to the current gh repo)
      --pr <N>              Filter to runs linked to pull request N
  -r, --reporter <name>     Output reporter (default: table)
  -n, --limit <int>         Max runs after filtering (default: 20)
      --include-reruns      Include non-final run attempts
      --no-color            Disable ANSI colors (honors NO_COLOR too)
  -v, --verbose             Log each gh call to stderr
  -h, --help                Show help
  -V, --version             Print version
```

### Examples

```sh
# Last 20 runs of the ci.yml workflow in the current repo
gh-workflow-explorer -w ci.yml

# Only runs linked to PR #42
gh-workflow-explorer -w ci.yml --pr 42

# Another repo, more history
gh-workflow-explorer -w release.yml -R torvalds/linux -n 50
```

## How deltas are computed

For each step, the tool sorts its executions chronologically and, for each run, compares against the
**nearest prior execution that was successful and on the same branch**. This avoids:

- Comparing against a failed run that bailed out at step 3 (which would make steps 4+ look
  artificially fast).
- Comparing a feature-branch run against a main-branch run (often different caches / machines).

First-in-series, skipped, and in-flight executions show `—` instead of a delta.

## Exit codes

| Code | Meaning                             |
| ---: | ----------------------------------- |
|    0 | Success                             |
|    1 | Unexpected error                    |
|    2 | Usage error (bad flags)             |
|    3 | Unknown reporter name               |
|   10 | `gh` not found on PATH              |
|   11 | `gh` not authenticated              |
|   12 | `gh` exited non-zero                |
|   20 | Workflow file not found on the repo |

## Known limitations

- **Composite actions** appear as a single step. The GitHub API does not expose the inner steps of a
  composite action.
- **Reusable workflows** (`uses: owner/repo/.github/workflows/other.yml`) surface as one opaque job.
  The tool does not recurse.
- **`--pr` for fork PRs** filters by PR head SHA, which can miss runs on force-pushed PRs where the
  SHA was rewritten.
- **Step rename / reorder**: steps are keyed by `(job.name, step.number, step.name)`. If a step is
  renamed, its history splits into two rows — this is deliberate. Fuzzy matching would risk silently
  merging unrelated steps.
- Matrix jobs are shown as distinct job groups (`test (ubuntu-latest, 20)`,
  `test (ubuntu-latest, 22)`). The matrix parameters stay in the name.

## Architecture

The project separates fetching, analysis, and presentation:

```
src/
├── gh/          shells out to gh, maps raw JSON to domain types
├── analysis/    pure grouping and delta math (no IO)
├── reporter/    pluggable renderers (table is the default)
└── cli/         arg parsing, help, run orchestration
```

New reporters (JSON, CSV, HTML) are single-file additions — implement `Reporter` and register it in
`src/reporter/registry.ts`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Commits must follow
[Conventional Commits](https://www.conventionalcommits.org/) so `release-please` can pick the right
version bump.

## License

[MIT](./LICENSE)
