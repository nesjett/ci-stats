import { listReporters } from "../reporter/registry.ts";

export function helpText(): string {
  return `gh-workflow-explorer — analyze GitHub Actions workflow run timings

USAGE:
  gh-workflow-explorer -w <workflow-file> [options]

REQUIRED:
  -w, --workflow <file>     Workflow filename (e.g. ci.yml)

OPTIONS:
  -R, --repo <owner/name>   Target repo (defaults to the current gh repo)
      --pr <N>              Filter to runs linked to pull request N
  -r, --reporter <name>     Output reporter: ${listReporters().join(", ")} (default: table)
  -n, --limit <int>         Max runs after filtering (default: 20)
      --include-reruns      Include non-final run attempts
      --no-color            Disable ANSI colors (also honors NO_COLOR)
  -v, --verbose             Log each gh call to stderr
  -h, --help                Show this help
  -V, --version             Print version

EXAMPLES:
  gh-workflow-explorer -w ci.yml
  gh-workflow-explorer -w ci.yml --pr 42
  gh-workflow-explorer -w ci.yml -R acme/app -n 50

Requires: gh (https://cli.github.com/) on PATH and authenticated (gh auth login).
`;
}
