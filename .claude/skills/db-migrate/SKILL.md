---
name: db-migrate
description: Creates a new PostgreSQL migration safely — writes it, has it reviewed for locking and compatibility, applies it to the LOCAL database only, and tests the rollback. Use for any schema change.
argument-hint: "[what the schema change should do]"
disable-model-invocation: true
---

# New database migration

Change: **$ARGUMENTS**

Existing migrations: !`ls -1 server/migrations migrations drizzle prisma/migrations 2>/dev/null | tail -15 || echo "(no migration directory found)"`

This workflow only ever touches the **local** database. Staging and production migrations run through the deployment pipeline — never from here.

## 1. Find the project's migration mechanism
Read `package.json` scripts and the migration directory to learn the tool (node-pg-migrate, Drizzle, Prisma, Knex, plain SQL...) and its commands for *create*, *up*, *down*, *status*. Use the project's scripts; do not introduce a second tool. If there is none yet, stop and propose one (default suggestion: plain SQL files with `node-pg-migrate`).

## 2. Design
- Inspect the current schema of the affected tables through the `postgres` MCP server or the schema source files.
- For anything beyond adding a nullable column or a simple index, get the design from `postgres-dba`.
- Decide the release sequence. If the change is not backwards compatible in one step (rename, drop, type change, new NOT NULL), split it: this migration is only the **expand** step; note the follow-up steps.

## 3. Write
Create the migration with the tool's *create* command so the name and timestamp follow convention. Follow `.claude/rules/migrations.md` — `lock_timeout`, `CONCURRENTLY`, `NOT VALID` + `VALIDATE`, batched backfills, a real down migration.

## 4. Review — gate
Run `migration-reviewer` on the new file(s). On **BLOCK** or **APPROVE WITH CHANGES**, fix and re-review. Do not continue without **APPROVE**.

## 5. Apply locally and prove it
1. State the target: print the database **host and name** the tool will connect to (not the password). It must be local. If it is not, stop.
2. Run *up*. Confirm with *status* and by inspecting the resulting schema.
3. Run *down*, confirm the schema is back, then *up* again. A rollback that was never executed does not count as tested.
4. Run the test suite that touches the database.

## 6. Update the code
Regenerate any types/schema artefacts the tool produces, update queries and shared types, and add or adjust tests.

## 7. Report
The migration file(s), the reviewer's verdict, the real output of up/down/up, the release sequence (which release ships this migration, which ships the dependent code, which ships the contract step), and any long-running statement to watch when it reaches production.
