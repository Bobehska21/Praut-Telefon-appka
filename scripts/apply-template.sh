#!/usr/bin/env bash
# Copies this Claude Code workflow template into another project.
#
#   scripts/apply-template.sh <target-project-dir> [--force] [--dry-run] [--no-ci] [--no-deploy]
#
# Existing files in the target are never overwritten unless --force is given;
# skipped files are listed so you can merge them by hand.
set -euo pipefail

usage() { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="" FORCE=0 DRY=0 CI=1 DEPLOY=1
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY=1 ;;
    --no-ci) CI=0 ;;
    --no-deploy) DEPLOY=0 ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $arg" >&2; usage 1 ;;
    *) [ -z "$TARGET" ] || { echo "Only one target directory allowed" >&2; exit 1; }; TARGET="$arg" ;;
  esac
done
[ -n "$TARGET" ] || usage 1
[ -d "$TARGET" ] || { echo "Target directory does not exist: $TARGET" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"
[ "$TARGET" != "$SRC" ] || { echo "Target is the template itself" >&2; exit 1; }

ITEMS=(
  CLAUDE.md .mcp.json .env.example .gitleaks.toml .sops.yaml
  .claude/settings.json .claude/environments.json
  .claude/agents .claude/skills .claude/rules .claude/hooks .claude/mcp
  docs/workflow.md docs/prod-readonly.md
)
[ "$DEPLOY" -eq 1 ] && ITEMS+=(deploy)
[ "$CI" -eq 1 ] && ITEMS+=(.github/workflows)

copied=0 skipped=()
while IFS= read -r -d '' file; do
  rel="${file#"$SRC"/}"
  dest="$TARGET/$rel"
  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    cmp -s "$file" "$dest" || skipped+=("$rel")
    continue
  fi
  if [ "$DRY" -eq 1 ]; then echo "would copy  $rel"; else mkdir -p "$(dirname "$dest")"; cp "$file" "$dest"; fi
  copied=$((copied + 1))
done < <(for item in "${ITEMS[@]}"; do [ -e "$SRC/$item" ] && find "$SRC/$item" -type f ! -name .DS_Store -print0; done)

# .gitignore: append the template's entries that the target does not have yet
if [ -f "$TARGET/.gitignore" ]; then
  missing="$(grep -vxFf "$TARGET/.gitignore" "$SRC/.gitignore" | grep -v '^#' | grep -v '^$' || true)"
  if [ -n "$missing" ]; then
    if [ "$DRY" -eq 1 ]; then echo "would append $(printf '%s\n' "$missing" | wc -l | tr -d ' ') line(s) to .gitignore"
    else printf '\n# added by the Claude Code workflow template\n%s\n' "$missing" >> "$TARGET/.gitignore"; fi
  fi
elif [ "$DRY" -eq 1 ]; then echo "would copy  .gitignore"
else cp "$SRC/.gitignore" "$TARGET/.gitignore"; fi

echo
if [ "$DRY" -eq 1 ]; then echo "Dry run for $TARGET: $copied file(s) would be copied."
else echo "Template applied to $TARGET: $copied file(s) copied."; fi
if [ "${#skipped[@]}" -gt 0 ]; then
  echo "Skipped ${#skipped[@]} existing file(s) that differ (merge by hand or re-run with --force):"
  printf '  %s\n' "${skipped[@]}"
fi
cat <<'EOF'

Next steps in the target project:
  1. Fill in the TODOs in CLAUDE.md (description, commands, environments table).
  2. List real kube contexts and DB hosts in .claude/environments.json.
  3. Rename deploy/helm/app to your service name (and "name:" in Chart.yaml, SERVICE in deploy.yml).
  4. Put real age public keys into .sops.yaml.
  5. Start `claude` there and approve the MCP servers from .mcp.json; run /preflight.
EOF
