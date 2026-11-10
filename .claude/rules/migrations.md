---
paths:
  - "**/migrations/**"
  - "**/migration/**"
  - "**/drizzle/**"
  - "**/prisma/schema.prisma"
---

# Migration rules

- A migration that exists on `main` is immutable (a hook enforces this). To change the schema, add a new migration.
- Every migration must be safe while the **previous** application version is still running. Use expand → backfill → switch code → contract, in separate releases. Never rename or drop a column in the same release that stops using it.
- Start with `SET lock_timeout = '5s';` so a migration that cannot get its lock fails fast instead of queueing all traffic.
- Indexes: `CREATE INDEX CONCURRENTLY` (outside a transaction block) and `DROP INDEX CONCURRENTLY`.
- New constraints: add `NOT VALID`, then `VALIDATE CONSTRAINT` in a separate statement. For `NOT NULL` on an existing column: validated `CHECK (col IS NOT NULL)` first, then `SET NOT NULL`, then drop the check.
- New columns: nullable or with a constant default. Backfill large tables in batches, not one transaction.
- No `DROP`/`TRUNCATE`/unbounded `DELETE` without it being called out explicitly in the PR description.
- Provide a working down migration, or state in a comment at the top that it is irreversible and why.
- Before applying anywhere and before committing: review by `migration-reviewer`. Apply only to the local database; staging and production migrations run through the deployment pipeline.
- Types: `timestamptz`, `text`, `bigint`/`uuid` keys, explicit `ON DELETE` on foreign keys, and an index on every foreign key used in joins.
