# gh-workflow-explorer

Analyze GitHub Actions workflow runs for a pull request from the terminal. Given a workflow file and
a PR number, it fetches every run of that workflow linked to the PR and renders **one table per
job**, where each row is a run and each column is a step. Each cell shows the step duration and the
**delta vs the previous successful run on the same branch** — so you can spot the step that quietly
got slower across the PR's history.

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
deno run --allow-run=gh --allow-env src/main.ts -w ci.yml --pr 42
```

## Requirements

- [`gh`](https://cli.github.com/) on `PATH`, authenticated (`gh auth login`). All GitHub API calls
  are delegated to `gh`, so this tool has no tokens of its own.

## Usage

```
gh-workflow-explorer -w <workflow-file> --pr <N> [options]

Required:
  -w, --workflow <file>     Workflow filename (e.g. ci.yml)
      --pr <N>              Pull request number to analyze

Options:
  -R, --repo <owner/name>   Target repo (defaults to the current gh repo)
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
# Runs of ci.yml linked to PR #42 in the current repo
gh-workflow-explorer -w ci.yml --pr 42

# Another repo, more history
gh-workflow-explorer -w release.yml -R torvalds/linux --pr 1337 -n 50
```

### Output shape

For each job in the workflow, one table is printed with dim `│` column separators and a `─` rule
under the header. **The run number is itself a clickable hyperlink** to the run on github.com (via
OSC 8 terminal escapes — supported by iTerm2, Windows Terminal, GNOME Terminal, WezTerm, kitty,
Alacritty and others; older terminals just show plain text).

```
▶ build
  Run             │ Checkout   │ Install        │ Test
  ─────────────────────────────────────────────────────────
  ✓ #103 (1003)   │ 4s ▼1s     │ 1m10s ▲10s     │ 56s ▲1s
  ✓ #102 (1002)   │ 6s         │ 1m20s          │ 1m34s
  ✓ #101 (1001)   │ 5s         │ 1m00s          │ 55s
```

Rows are the PR's runs, newest on top. Columns are the steps in execution order. Colors:

- **Run label** tinted by overall conclusion (green success, red failure, yellow cancelled), with a
  matching `✓` / `✗` / `⊘` / `·` (skipped) glyph so the signal survives `NO_COLOR`.
- **Deltas** carry a `▲` (slower) or `▼` (faster) arrow plus a magnitude tier:
  - **Bold red** `▲30s` — significant regression (≥20% AND ≥1s)
  - **Red** `▲10s` — regular regression
  - **Dim** `▲500ms` — trivial change (<500 ms or <5%)
  - **Green** `▼3s` — improvement
  - **Dim** `±0` — no change
- Column headers and the `▶` job marker in **cyan**, borders in **dim** so data stands out.

If a job has too many steps to fit the terminal, the table is split into **multiple sub-tables**
that share the Run column, each annotated with `(steps a–b of N)`. No data is dropped. Step names
longer than 36 characters are middle-truncated (`Run GIT_MESSAGE=$(…fe5e4fa5e306604b)`) and listed
in full in a dim footnote at the end of each job. Set `NO_COLOR=1` or pass `--no-color` to strip
ANSI escapes entirely; the URL won't be visible in that mode (use `--reporter json` once available
for machine-readable output).

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
- **`--pr` matching** uses the PR's commit SHAs (via `gh pr view`) combined with the runs'
  `pull_requests` array. Force-pushed PRs whose older SHAs are no longer reachable may lose some
  historical runs.
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
