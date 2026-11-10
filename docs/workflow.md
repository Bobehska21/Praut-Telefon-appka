# Claude Code workflow: Electron + PostgreSQL + Kubernetes

Přehled toho, co je nastavené, kde to leží a jak se to používá.

## Dvě vrstvy

| Vrstva | Kde | Co dělá |
|---|---|---|
| Globální | `~/.claude/` | Bezpečnostní hooky, oprávnění, status line. Platí v každém projektu na tomto Macu. |
| Projekt | `.claude/`, `.mcp.json`, `CLAUDE.md` | Agenti, slash příkazy, pravidla, projektové hooky, MCP servery. Verzuje se v gitu. |

Do nového projektu se šablona nanese příkazem `scripts/apply-template.sh <cesta> [--dry-run]`.

## Běžný den

| Chci | Příkaz |
|---|---|
| Postavit funkci od návrhu po review | `/feature <popis>` |
| Ověřit, že je vše v pořádku | `/preflight` (s `--e2e` i end-to-end testy) |
| Změnit schéma databáze | `/db-migrate <popis>` |
| Zjistit něco o databázi, zrychlit dotaz | `/db-inspect <otázka>` |
| Spustit lokální prostředí | `/local-up`, úklid `/local-down` |
| Nasadit | `/k8s-deploy dev\|staging\|prod` |
| Něco v clusteru nefunguje | `/k8s-debug <příznak>` |
| Bezpečnostní audit Electronu | `/electron-audit` |
| Připravit vydání | `/release <verze>` |
| Výpadek | `/incident <popis>` |

Příkazy, které něco mění (`/feature`, `/db-migrate`, `/k8s-deploy`, `/local-*`, `/release`, `/incident`), spouštíš jen ty. Čtecí (`/preflight`, `/db-inspect`, `/k8s-debug`, `/electron-audit`) může Claude použít i sám.

## Agenti

Claude je volá sám podle popisu, nebo je vyžádej jménem („použij k8s-troubleshooter“).

| Agent | Model | Smí měnit soubory | Kdy |
|---|---|---|---|
| `electron-architect` | opus | ano | IPC kanály, okna, hranice procesů |
| `electron-security-auditor` | opus | ne | po změnách main/preload, před vydáním |
| `backend-dev` | sonnet | ano | API služba v `server/` |
| `postgres-dba` | opus | ne | návrh schématu, výkon dotazů |
| `migration-reviewer` | sonnet | ne | každá migrace |
| `k8s-engineer` | sonnet | ano | vše v `deploy/` |
| `k8s-troubleshooter` | sonnet | ne | diagnostika clusteru |
| `release-engineer` | sonnet | ano | balení, podpis, notarizace, auto-update |
| `test-engineer` | sonnet | ano | Vitest, Playwright, integrační testy |
| `docs-researcher` | haiku | ne | ověření aktuálního API knihovny |

## Prostředí a bezpečnost

| Prostředí | Jak se pozná | Claude smí |
|---|---|---|
| lokální | kontext `kind-*`, `orbstack`…; DB `localhost` | měnit |
| ostatní (staging) | cokoli jiného | měnit po tvém potvrzení |
| produkce | název obsahuje `prod`/`production`/`prd`/`live`, nebo je ve tvém `environments.json` | **jen číst** |

Status line dole ukazuje aktuální kube kontext; produkce svítí červeně.

Hooky jsou druhá linie obrany. První je serverové omezení: postup v [`prod-readonly.md`](prod-readonly.md). **Udělej ho dřív, než pustíš Claude k produkci.**

### Globální hooky (`~/.claude/hooks/`)

| Hook | Kdy | Co dělá |
|---|---|---|
| `guard-bash` | před každým shell příkazem | blokuje `rm -rf` na domovskou složku/kořen/`.git`, force-push na `main`, `curl \| sh`, `chmod -R 777`, čtení `.env` a klíčů; ptá se u `git reset --hard`, `git clean -f`, mazání mimo projekt, `DROP`/`TRUNCATE`, `sudo`, `sops -d` |
| `guard-k8s` | dtto | produkční kontext: jen čtecí `kubectl`/`helm` |
| `guard-db` | dtto | produkční DB: jen čtecí SQL, žádné migrace |
| `scan-commit` | před `git commit` | hledá tajemství ve změnách (gitleaks + vlastní vzory) |
| `guard-secrets` | před zápisem souboru | blokuje zápis do `.env`, klíčů, kubeconfigu a plaintext k8s Secret; ptá se, když obsah vypadá jako tajemství |
| `session-context` | start relace | sdělí Claudovi větev, kube kontext a jeho klasifikaci, chybějící nástroje |
| `notify` | Claude čeká na vstup | macOS notifikace (vypnutí: `CLAUDE_NOTIFY=0`) |

Testy hooků: `node --test ~/.claude/hooks/test/`

### Projektové hooky (`.claude/hooks/`)

| Hook | Kdy | Co dělá |
|---|---|---|
| `guard-files` | před zápisem | migrace, která už je na `main`, a lockfile nejdou upravit ručně |
| `format` | po zápisu | Prettier + `eslint --fix` (jsou-li v projektu) |
| `validate-k8s` | po zápisu v `deploy/` | `helm lint` + `kubeconform` pro každý `values-*.yaml` |
| `typecheck-on-stop` | než Claude skončí | `tsc --noEmit`, pokud se měnily `.ts` soubory (vypnutí: `CLAUDE_SKIP_TYPECHECK=1`) |

### Když hook zablokuje něco oprávněného
- Blokace na produkci je záměr: příkaz spusť sám v terminálu, nebo v promptu přes `! <příkaz>`.
- Falešný poplach jinde: uprav vzory v `environments.json`, případně pravidlo v příslušném hooku a doplň test.

## MCP servery (`.mcp.json`)

| Server | K čemu | Omezení | Potřebuje |
|---|---|---|---|
| `postgres` | schéma, dotazy, `EXPLAIN`, zdraví DB | `--access-mode=restricted` (čtení) | běžící Docker (OrbStack), proměnnou `DATABASE_URL_RO` |
| `kubernetes` | objekty, logy, události | `read_only = true` v `.claude/mcp/kubernetes.toml` | kubeconfig |
| `playwright` | ovládání okna běžící aplikace | připojuje se přes CDP | aplikaci spuštěnou s `--remote-debugging-port=9222` |
| `context7` | aktuální dokumentace knihoven | — | nic (volitelně API klíč) |

Při prvním spuštění `claude` v projektu servery schval. Stav: `/mcp`. GitHub se obsluhuje přes `gh` CLI, ne přes MCP.

Servery se stahují ve verzi `@latest`. Pro tým je připni na konkrétní verze.

## Tajemství
- `.env` je v `.gitignore`; Claude ho nesmí číst ani zapisovat. Nové proměnné patří s placeholderem do `.env.example`.
- Tajemství pro cluster: SOPS + age, viz [`deploy/secrets/README.md`](../deploy/secrets/README.md).
- Podpisové certifikáty a notarizační klíče jsou jen v tajemstvích CI.

## Kubernetes

- Lokálně: `kind` cluster `dev` (kontext `kind-dev`), definice v `deploy/kind/cluster.yaml`, API na `http://app.localtest.me:8080`.
- Chart `deploy/helm/app` je šablona: Deployment, Service, Ingress, HPA, PDB, NetworkPolicy (default deny), CloudNativePG `Cluster`, volitelný migrační Job.
- PostgreSQL spravuje operátor CloudNativePG. Přihlašovací údaje aplikace vytváří operátor do Secretu `<release>-db-app`.
- **Před ostrým provozem** doplň v `values-prod.yaml` blok `database.backup` (objektové úložiště + archivace WAL) a vyzkoušej obnovu. Bez toho produkční databáze nemá zálohy.

## CI (`.github/workflows/`)

| Soubor | Spouští se | Co dělá |
|---|---|---|
| `ci.yml` | PR, push na `main` | lint, typy, testy, integrační testy s Postgresem, e2e na 3 OS, validace chartů, sken tajemství, audit závislostí |
| `release.yml` | tag `v*.*.*` | build, podpis, notarizace, **koncept** vydání na GitHubu |
| `deploy.yml` | push na `main` | image → staging automaticky → produkce po schválení v GitHub Environment |

Před prvním použitím: připni akce na SHA (`pinact run`), založ prostředí `staging`, `production` (s povinným schvalovatelem) a `release` a nahraj do nich tajemství uvedená v hlavičkách souborů.

## Úpravy sady
- Nový agent: soubor v `.claude/agents/`. Popis (`description`) rozhoduje, kdy ho Claude zavolá.
- Nový příkaz: `.claude/skills/<název>/SKILL.md`.
- Pravidlo pro část kódu: `.claude/rules/*.md` s `paths:`.
- Po úpravě ověř přes `/agents`, `/hooks`, `/permissions`, `/mcp`.
