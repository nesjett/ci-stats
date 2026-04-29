# gh-workflow-explorer

[![CI](https://github.com/nesjett/Github-workflow-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/nesjett/Github-workflow-explorer/actions/workflows/ci.yml)
[![Release](https://github.com/nesjett/Github-workflow-explorer/actions/workflows/release.yml/badge.svg)](https://github.com/nesjett/Github-workflow-explorer/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/nesjett/Github-workflow-explorer?display_name=tag&logo=github)](https://github.com/nesjett/Github-workflow-explorer/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Deno](https://img.shields.io/badge/deno-2.x-black?logo=deno)](https://deno.com)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org)

🔍 Analyze GitHub Actions workflow runs from the terminal. Given a workflow file (and optionally a
PR number), it fetches recent runs and renders **one table per job**, where each row is a run and
each column is a step. Each cell shows the step duration and the **delta vs the previous successful
run on the same branch** — so you can spot the step that quietly got slower.

## 📦 Install

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

## 🔧 Requirements

- [`gh`](https://cli.github.com/) on `PATH`, authenticated (`gh auth login`). All GitHub API calls
  are delegated to `gh`, so this tool has no tokens of its own.

## 🚀 Usage

```
gh-workflow-explorer -w <workflow-file> [options]

Required:
  -w, --workflow <file>     Workflow filename (e.g. ci.yml)

Options:
      --pr <N>              Filter to runs linked to pull request N
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
# Last 20 runs of ci.yml in the current repo
gh-workflow-explorer -w ci.yml

# Only runs linked to PR #42
gh-workflow-explorer -w ci.yml --pr 42

# Another repo, more history
gh-workflow-explorer -w release.yml -R torvalds/linux -n 50
```

### Output shape

For each job in the workflow, one table is printed with a full Unicode box (`┌─┬─┐ ├─┼─┤ └─┴─┘`) in
dim. **The run number is itself a clickable hyperlink** to the run on github.com (via OSC 8 terminal
escapes — supported by iTerm2, Windows Terminal, GNOME Terminal, WezTerm, kitty, Alacritty and
others; older terminals just show plain text).

```
▶ build
  ┌─────────────────┬──────────┬──────────────┬──────────┐
  │ Run             │ Checkout │ Install      │ Test     │
  ├─────────────────┼──────────┼──────────────┼──────────┤
  │ ✓ #103 (1003)   │ 4s ▼1s   │ 1m10s ▲10s   │ 56s ▲1s  │
  │ ✓ #102 (1002)   │ 6s       │ 1m20s        │ 1m34s    │
  │ ✓ #101 (1001)   │ 5s       │ 1m00s        │ 55s      │
  └─────────────────┴──────────┴──────────────┴──────────┘
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

## 📊 How deltas are computed

For each step, the tool sorts its executions chronologically and, for each run, compares against the
**nearest prior execution that was successful and on the same branch**. This avoids:

- Comparing against a failed run that bailed out at step 3 (which would make steps 4+ look
  artificially fast).
- Comparing a feature-branch run against a main-branch run (often different caches / machines).

First-in-series, skipped, and in-flight executions show `—` instead of a delta.

## 🚦 Exit codes

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

## ⚠️ Known limitations

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

## 🏗️ Architecture

The project separates fetching, analysis, and presentation:

```
src/
├── gh/                shells out to gh, maps raw JSON to domain types
├── analysis/          pure grouping and delta math (no IO)
├── reporter/
│   ├── reporter.ts    Reporter interface + ReporterContext
│   ├── registry.ts    static name → factory map (e.g. "table")
│   └── table/         the default reporter
│       ├── mod.ts     tableReporter — domain/render orchestration
│       └── grid.ts    ANSI-aware grid renderer with Unicode box borders
└── cli/               arg parsing, help, run orchestration
```

Each reporter lives in its **own subfolder** under `src/reporter/`. Adding a new reporter is two
steps:

1. Create `src/reporter/<name>/mod.ts` exporting a `ReporterFactory` (e.g. `jsonReporter`,
   `csvReporter`, `htmlReporter`). Helper modules — templates, escaping, etc. — sit alongside it in
   the same subfolder so they don't leak into other reporters.
2. Register it in `src/reporter/registry.ts`:
   ```ts
   import { jsonReporter } from "./json/mod.ts";
   const builtins: Readonly<Record<string, ReporterFactory>> = {
     table: tableReporter,
     json: jsonReporter,
   };
   ```

## 🧪 Testing against the bundled fixture

The repo ships a synthetic GitHub Actions workflow at
[`.github/workflows/explorer-fixture.yml`](./.github/workflows/explorer-fixture.yml) that
deliberately exercises every shape this tool cares about:

- multi-step `lint` job
- a 4-cell matrix `build` (os × node)
- chained `needs:` dependencies producing queue gaps
- a `heavy` job with 20 sequential steps (forces horizontal pagination)
- a `flaky` job (`continue-on-error`) where one step fails ~1/3 of the time — exercises the red `✗`
  rendering, the run-label conclusion tinting, and the "previous successful" baseline logic
- a reusable workflow call ([`explorer-reusable.yml`](./.github/workflows/explorer-reusable.yml))
  rendered as a single opaque job
- a `summary` job with `if: always()` that runs even when upstream jobs fail

Both fixture workflows are **manual-only** — no `pull_request` or `push` triggers — so they cost
nothing unless you explicitly ask for a run.

### Trigger a fixture run

```sh
# Kick off one run.
gh workflow run explorer-fixture.yml --repo <owner/repo>

# Watch it complete (~1–2 min).
gh run watch --repo <owner/repo>

# Re-run a few times to populate enough history for deltas to materialise.
for _ in 1 2 3; do gh workflow run explorer-fixture.yml --repo <owner/repo>; sleep 30; done
```

### Explore the resulting runs

```sh
# All runs of the fixture.
gh-workflow-explorer -w explorer-fixture.yml -R <owner/repo>

# Just the latest 5, with verbose gh logging.
gh-workflow-explorer -w explorer-fixture.yml -R <owner/repo> -n 5 -v

# Including non-final attempts of any re-run.
gh-workflow-explorer -w explorer-fixture.yml -R <owner/repo> --include-reruns
```

What to look for in the output:

- **Matrix expansion** — `build (ubuntu-latest, 20)`, `build (ubuntu-latest, 22)`, etc. each show up
  as a separate `▶` job table.
- **Skipped steps** — `Skipped on main only`, `Skipped (false guard)`, and matrix-conditional steps
  render as a dim `·`.
- **Failure handling** — when the `flaky` job's `Roll the dice` step fails, that run's row in the
  `flaky` table is red with a `✗` glyph, and the next successful run's deltas correctly skip the
  failed run as a baseline (per the _previous successful same-branch_ rule).
- **Reusable workflow** — the `reusable` job appears once with no inner steps from
  `explorer-reusable.yml` (documented limitation).
- **Pagination** — the `heavy` job has 20 steps and will split into multiple sub-tables annotated
  `(steps a–b of 20)`.

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Commits must follow
[Conventional Commits](https://www.conventionalcommits.org/) so `release-please` can pick the right
version bump.

## 📜 License

Released under the [MIT License](./LICENSE) — short, permissive, and the de-facto standard in the
Deno / GitHub-tooling ecosystem. You're free to use, modify, fork, vendor, and relicense your
derivative work; just keep the copyright notice. No patent grant — if that matters for your use
case, vendor the source under Apache-2.0 in your downstream project.
