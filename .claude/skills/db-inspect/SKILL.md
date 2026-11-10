---
name: db-inspect
description: Read-only inspection of a PostgreSQL database — schema, indexes, table sizes, slow queries, locks, bloat, index usage. Use to answer questions about the database's structure or health, or to diagnose a slow query.
argument-hint: "[question, table name, or a query to analyse]"
context: fork
agent: postgres-dba
---

# Database inspection

Question: **$ARGUMENTS**

Everything here is read-only. Use the `postgres` MCP server (restricted mode) first; fall back to `psql -c` with a single read-only statement.

1. **Identify the target.** Report the host and database name you are connected to, and whether it is local, staging or production. On production keep every query cheap: catalog and statistics views, `LIMIT`, no full scans of large tables.

2. **Answer the question** with the smallest set of queries. Useful sources:
   - Structure: `information_schema.columns`, `pg_indexes`, `pg_constraint`, or the MCP schema tools.
   - Size: `pg_total_relation_size`, `pg_stat_user_tables` (`n_live_tup`, `n_dead_tup`, last (auto)vacuum/analyze).
   - Slow queries: `pg_stat_statements` ordered by `total_exec_time` and by `mean_exec_time` (say so if the extension is not installed).
   - A specific query: `EXPLAIN (ANALYZE, BUFFERS)` for a read-only statement; plain `EXPLAIN` for anything that writes.
   - Index health: `pg_stat_user_indexes` (`idx_scan = 0` → unused), duplicate or overlapping indexes, foreign keys without an index.
   - Activity: `pg_stat_activity` (long transactions, idle in transaction), `pg_locks` joined to find blockers.

3. **Report**
   - The answer, with the evidence (the numbers or the plan).
   - Problems you noticed on the way, ranked by impact.
   - For each recommended change: the exact SQL, its locking behaviour on a table of this size, and that it must go through `/db-migrate`.

Never run a statement that writes, and never print connection strings or credentials.
