---
name: release
description: Prepares a desktop app release — verifies the tree, bumps the version, writes the changelog, builds and checks the package locally, and stops before tagging and publishing until explicitly confirmed.
argument-hint: "[version or patch|minor|major]"
disable-model-invocation: true
---

# Release

Requested version: **$ARGUMENTS**

- Branch: !`git branch --show-current 2>/dev/null || echo "?"`
- Working tree: !`git status --short 2>/dev/null | wc -l | tr -d ' '` uncommitted file(s)
- Current version: !`node -p "require('./package.json').version" 2>/dev/null || echo "no package.json"`
- Last tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "(no tags)"`

Signing, notarization and publishing happen in CI on the tag, with certificates that exist only there. Locally you prepare and verify. Use `release-engineer` for any packaging or signing problem.

## 1. Gates — stop if any fails
- On `main`, clean working tree, up to date with the remote.
- CI is green for this commit (`gh run list --branch main --limit 5`).
- `/preflight --e2e` passes.
- `/electron-audit` has no critical or high findings open.
- Migrations in this release are backwards compatible with the previous app version, and the backend that supports this client version is already deployed.

## 2. Version and changelog
- Decide the version: explicit, or derived from Conventional Commits since the last tag (`feat` → minor, `fix` → patch, a breaking-change marker or `BREAKING CHANGE` footer → major). State the reasoning.
- Create branch `release/v<version>`; bump `package.json` (and the lockfile via `npm version <v> --no-git-tag-version`).
- Update `CHANGELOG.md`: user-facing wording grouped as Added / Changed / Fixed / Security, from the commits since the last tag.

## 3. Local build verification
- Unsigned build for the current platform using the project's build script.
- Inspect the result: the app starts; the version shown is correct; the asar contains no `.env`, tests, or dev-only files; fuses are set.
- State clearly what was **not** verified locally: signing, notarization, the other platforms, auto-update from the previous version.

## 4. Stop and hand over
Show: version, changelog entry, verification results, and the remaining steps. **Do not commit, tag, push or publish until the user explicitly says so.** When they do:
1. Commit `chore(release): v<version>`, open a PR, merge after CI.
2. Tag `v<version>` on `main` and push the tag → the release workflow builds, signs, notarizes and creates a **draft** release.
3. The human tests the draft's installers and auto-update from the previous version, then publishes the draft.

## 5. After publishing
Watch the release workflow (`gh run watch`), confirm the update feed serves the new version, and note the rollback: unpublish the release / republish the previous version's feed.
