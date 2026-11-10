# Produkce jen pro čtení: vynucení na straně serveru

Hooky (`guard-k8s`, `guard-db`) rozpoznávají příkazy podle textu. Jsou to dobré zábrany proti omylu, ale ne bezpečnostní hranice: příkaz zabalený ve skriptu nebo neznámý nástroj jimi projde. Skutečné „jen pro čtení“ musí vynutit cluster a databáze. Nastav obojí jednou a Claude pak fyzicky nemá čím produkci změnit.

## 1. Kubernetes: účet s rolí `view`

Spusť sám proti produkčnímu clusteru (Claude to má zablokované):

```sh
CTX=<produkční-kontext>
kubectl --context "$CTX" create namespace claude-readonly
kubectl --context "$CTX" -n claude-readonly create serviceaccount claude
kubectl --context "$CTX" create clusterrolebinding claude-view \
  --clusterrole=view --serviceaccount=claude-readonly:claude
```

Vestavěná role `view` umí číst většinu objektů, **neumí** číst Secrety, měnit cokoli ani `exec`.

Vytvoř samostatný kubeconfig s krátkodobým tokenem:

```sh
TOKEN=$(kubectl --context "$CTX" -n claude-readonly create token claude --duration=8h)
SERVER=$(kubectl config view --minify --context "$CTX" -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl config view --minify --raw --context "$CTX" -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')

OUT=~/.kube/claude-readonly.yaml
kubectl --kubeconfig "$OUT" config set-cluster prod --server="$SERVER"
kubectl --kubeconfig "$OUT" config set clusters.prod.certificate-authority-data "$CA"
kubectl --kubeconfig "$OUT" config set-credentials claude --token="$TOKEN"
kubectl --kubeconfig "$OUT" config set-context prod-readonly --cluster=prod --user=claude
kubectl --kubeconfig "$OUT" config use-context prod-readonly
chmod 600 "$OUT"
```

Ověření:

```sh
kubectl --kubeconfig "$OUT" auth can-i delete pods -A     # no
kubectl --kubeconfig "$OUT" auth can-i get secrets -A     # no
kubectl --kubeconfig "$OUT" get pods -A                   # funguje
```

Použití:
- **Relace Claude Code nad produkcí** spouštěj s `KUBECONFIG=~/.kube/claude-readonly.yaml claude`. Tvůj administrátorský kubeconfig pak v relaci vůbec není.
- **MCP server**: v `.claude/mcp/kubernetes.toml` odkomentuj `kubeconfig = "..."` a nastav cestu k tomuto souboru.

Token platí 8 hodin; po vypršení zopakuj krok s `create token`.

## 2. PostgreSQL: role `claude_ro`

Spusť jako správce na každé databázi, kam má Claude vidět:

```sql
CREATE ROLE claude_ro LOGIN PASSWORD '<vygeneruj>' CONNECTION LIMIT 3;
GRANT pg_read_all_data TO claude_ro;                       -- PostgreSQL 14+
ALTER ROLE claude_ro SET default_transaction_read_only = on;
ALTER ROLE claude_ro SET statement_timeout = '30s';
ALTER ROLE claude_ro SET idle_in_transaction_session_timeout = '60s';
```

`pg_read_all_data` dává `SELECT` na všechny tabulky, ale žádné zápisy ani DDL. `default_transaction_read_only` je navíc pojistka; skutečnou hranicí jsou chybějící oprávnění k zápisu.

Pokud tabulky obsahují osobní údaje, které Claude vidět nemá, místo `pg_read_all_data` uděl `SELECT` jen na vybraná schémata nebo pohledy.

Ověření:

```sh
psql "postgresql://claude_ro@<host>/<db>" -c "CREATE TABLE x(i int)"   # ERROR: permission denied
psql "postgresql://claude_ro@<host>/<db>" -c "SELECT 1"                # funguje
```

Použití: do svého `.env` dej `DATABASE_URL_RO=postgresql://claude_ro:<heslo>@<host>:5432/<db>`. Server `postgres` v `.mcp.json` čte právě tuto proměnnou a běží v režimu `--access-mode=restricted`.

## 3. Co hlídají hooky navíc

| Situace | Chování |
|---|---|
| `kubectl`/`helm` měnící příkaz, kontext odpovídá produkci | zablokováno |
| `kubectl config use-context <prod>`, `kubectx <prod>` | zablokováno (prod se nesmí stát výchozím kontextem) |
| `kubectl get secret -o yaml` na produkci, `kubectl config view --raw` | zablokováno |
| `psql` na produkční host | povoleno jen `-c` s prokazatelně čtecím SQL |
| `pg_restore`, `dropdb`, migrační nástroje na produkční host | zablokováno |
| `pg_dump` z produkce | dotaz na potvrzení |
| `sops -d` na souboru s `prod` v názvu | zablokováno |

Co je „produkce“, určují vzory v `~/.claude/environments.json` a `.claude/environments.json`. Výchozí vzor zachytí názvy obsahující `prod`, `production`, `prd`, `live`. **Pokud se tvůj produkční kontext nebo DB host jmenuje jinak, musíš ho tam doplnit**, jinak ho hooky za produkci nepovažují.
