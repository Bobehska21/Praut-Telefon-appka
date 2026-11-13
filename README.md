# Focus Mode

Mobilní aplikace, která pomáhá soustředit se. Při zapnutém **focus módu** fungují jen aplikace, které sis
předem povolil (whitelist); vše ostatní je zablokované, dokud mód nevypneš. K tomu má systém pokroku (XP, levely,
úkoly, úspěchy, denní cíl 90 minut), detekci dalších uživatelů v okolí přes Bluetooth a volitelnou
multiplayerovou hru **„Ulov wastemana“**, ve které mohou hráči, kteří se vzdají soustředění, „zabít“ hráči poblíž.
Nad tím jsou **štíty**, **sázky na relaci** a **admin režim** pro testování a správu.

Stav projektu: **rozpracováno, nevydáno.** Android aplikace běží na skutečných telefonech; iOS je napsané,
ale nikdy nebylo přeloženo. Viz [Stav](#stav).

Podrobný český [návod pro uživatele](docs/uzivatelsky-navod-cs.md) popisuje instalaci, první nastavení,
ovládání, herní pravidla a řešení potíží. [Podklady pro informační web](docs/podklady-pro-informacni-web-cs.md)
obsahují hotové texty, návrh stránek a údaje potřebné před zveřejněním instalace.

## Informační web

Web je uložený v [`web/index.html`](web/index.html). Odkazy ke stažení APK vedou do
[GitHub Releases](https://github.com/Bobehska21/Praut-Telefon-appka/releases/tag/android-latest).
GitHub slouží k distribuci APK; adresa multiplayerového serveru se nastavuje samostatně v aplikaci.

Workflow [`pages.yml`](.github/workflows/pages.yml) zveřejňuje pouze složku `web/` po její změně v `main`.
V nastavení repozitáře **Settings → Pages → Build and deployment → Source** vyber **GitHub Actions**.
Workflow lze spustit také ručně v záložce Actions.

Očekávaná adresa po úspěšném nasazení je
[bobehska21.github.io/Praut-Telefon-appka](https://bobehska21.github.io/Praut-Telefon-appka/).
Výslednou adresu a stav nasazení ověř v běhu workflow GitHub Pages. Web používá původní externí
Tailwind CSS a Google Fonts, takže pro plné zobrazení potřebuje připojení k internetu.

## Co je v repozitáři

| Cesta | Co |
|---|---|
| [`mobile/`](mobile) | Aplikace: React Native (Expo SDK 58) + TypeScript, s nativním modulem `Focus` v Kotlinu (Android) a Swiftu (iOS) |
| [`server/`](server) | Multiplayerový backend: Node + Fastify + PostgreSQL (účty, body, zabití, štíty, sázky, žebříček, fotky, nahlášení, moderace, admin) |
| [`docs/multiplayer-api.md`](docs/multiplayer-api.md) | API serveru, pravidla, stavový automat, důkaz blízkosti a limity ověřování na serveru (anglicky) |
| [`mobile/docs/what-the-app-does.md`](mobile/docs/what-the-app-does.md) | Přesný popis všeho, co aplikace dělá, včetně toho, co je otestované a co ne (anglicky) |
| [`mobile/README.md`](mobile/README.md) | Build, oprávnění, detaily platforem a známá omezení aplikace (anglicky) |
| [`server/README.md`](server/README.md) | Spuštění serveru, proměnné prostředí, účty a hesla, provoz (anglicky) |
| `.claude/`, `CLAUDE.md`, `deploy/`, `.github/`, `docs/workflow.md` | Šablona pracovního postupu Claude Code, ze které repozitář vznikl (agenti, hooky, Helm chart, CI). Netýká se aplikace |

## Funkce

**Focus mód**
- Profily (Práce, Učení, Spánek, vlastní), každý s vlastním seznamem povolených aplikací.
- Start s časovačem nebo „dokud nevypnu“; rozvrhy mód spouštějí automaticky ve zvolené dny a časy.
- Android: služba usnadnění (Accessibility) zjistí, která aplikace je popředí, a když není povolená, vrátí
  obrazovku focus módu (mřížku povolených aplikací). Stažení lišty oznámení, hovory, SMS a tísňová volání
  fungují dál. Mód přežije zabití aplikace i restart telefonu.
- Volitelná pojistka vypnutí (30 s odpočet nebo opsání věty).
- iOS (neověřeno): API Apple Screen Time se třemi rozšířeními.

**Pokrok**
- XP jen z úkolů a úspěchů; body z minut ve focus módu (+1 za minutu nad 90 za den) a ze zabití.
- Levely a hodnosti, denní a týdenní úkoly, úspěchy, série, statistiky.

**Hráči v okolí (Android, Bluetooth LE)**
- Vysílání obsahuje jen náhodně vypadající token, který se mění každou půlnoc, a bajt stavu;
  žádné jméno ani poloha. Podrobnosti se čtou až poté, co to druhý člověk potvrdí.

**Multiplayer „Ulov wastemana“ (Android)**
- Účet s uživatelským jménem a heslem, **bez e-mailu**. Uživatelské jméno je soukromé; ostatní vidí jen filtrovanou
  přezdívku, hodnost a volitelnou fotku.
- Hráč, který ručně vypne běžící focus mód, se stává wastemanem, dokud focus znovu nezapne. Kdokoli poblíž,
  kdo má ten den aspoň 90 minut soustředění, může wastemana zabít: +50 bodů, oběť ztratí 25 % bodů toho dne
  a hodinu je imunní. Zabití vyžaduje podepsaný důkaz z telefonu oběti přes Bluetooth.
- Denní žebříček (řazený podle zabití), osobní statistiky, blokování a nahlašování, vypínač multiplayeru, smazání účtu.

**Štíty**
- 5 hodin připsaného soustředění v JEDNÉ relaci = 1 štít (maximum 3). Štít pohltí jedno zabití (oběť body neztratí)
  a dá 10 minut imunity. Hráč dostane oznámení o získání i o zablokování.

**Sázky na relaci (Android, multiplayer)**
- Před startem hráč vsadí část dnešních bodů (nejvýše dnešní čistý zisk), zvolí násobič (2×, 5×, 10×) a délku relace
  (nejméně 15 min × násobič). Dokončená relace vyplatí vsazené body × (násobič − 1); předčasné ukončení stojí vsazené body.
  Násobič nemá vliv na zabíjení.

**Admin (jen s účtem, který má na serveru příznak admina)**
- Přidání a odebrání bodů vybranému hráči (s poznámkou), hledání hráčů. Oprávnění se ověřuje na serveru při každém
  požadavku a každá akce se zapisuje do auditního logu (kdo, komu, co, kdy).
- Na vývojovém serveru zkratky pro test minut a štítů. Podrobnosti: [`docs/multiplayer-api.md`](docs/multiplayer-api.md).

## Architektura

```
 Telefon A (aplikace)                                   Telefon B (aplikace, wasteman)
 ┌──────────────────────────┐   Bluetooth LE            ┌──────────────────────────┐
 │ React Native UI + store  │◀────────────────────────▶ │ vysílá token + stav      │
 │ Kotlin modul: focus      │   výzva / podpis zabití   │ podepisuje výzvy klíčem  │
 │ služba, usnadnění, BLE,  │                           │ z Keystore               │
 │ synchronizace se serverem│                           └─────────────┬────────────┘
 └─────────────┬────────────┘                                         │
               │ HTTPS (testovací buildy povolují i prosté HTTP)      │
               ▼                                                      ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │ server: Fastify + PostgreSQL – ověřuje každé pravidlo, připisuje │
        │ body z heartbeatů, kontroluje podpis, provede zabití             │
        └─────────────────────────────────────────────────────────────────┘
```

Nativní strana je zdrojem pravdy o tom, zda focus mód běží. Server telefonu nevěří:
body se připisují z heartbeatů (jednou za minutu, nejvýše 90 s na heartbeat) a zabití se provede v jedné databázové
transakci po ověření podpisu oběti (ECDSA P-256, klíč v Android Keystore).

## Rychlý start (vývoj)

Požadavky: Node 22.13+, Docker, a pro Android JDK 17, Android SDK a telefon se zapnutým laděním přes USB.

```sh
# 1. Server a databáze (jen lokálně)
cd server
npm install
docker compose up -d --wait
export DATABASE_URL=postgresql://focus:focus_local_dev@localhost:5433/focus_dev   # výchozí heslo z docker-compose.yml
export ADMIN_TOKEN=$(openssl rand -hex 24)
export DEV_FAKE_MINUTES=true            # jen vývoj: zkratky pro test minut a štítů
npm run migrate
ADMIN_SEED_PASSWORD=<heslo> npm run seed:admin   # volitelně: vytvoří účet "admin" (jen mimo produkci)
npm run dev                             # http://localhost:3000/healthz

# 2. Aplikace
cd ../mobile
npm install
npm run android                         # vytvoří vývojový klient; potřebuje Metro (npx expo start)
adb reverse tcp:8081 tcp:8081           # Metro
adb reverse tcp:3000 tcp:3000           # server (opakuj pro každý telefon; USB je někdy zahodí)
```

Kontroly: `npm run typecheck && npm run lint && npm test` v `mobile/` i `server/`
(testy serveru potřebují databázi z Dockeru).

**Bez kabelu:** workflow [`android-apk.yml`](.github/workflows/android-apk.yml) na GitHubu sestaví APK a
zveřejní ho jako pre-release `android-latest`. Telefon se pak připojí k serveru na Macu přes Wi-Fi
(`http://<IP-Macu>:3000`, nastavuje se v aplikaci). Testovací buildy proto povolují prosté HTTP.

## Stav

| Část | Stav |
|---|---|
| Logika aplikace (store, plánovač, pokrok, filtr přezdívek, pojistka vypnutí, sázky) | hotovo, 214 unit testů |
| Android focus mód | běží na dvou telefonech Xiaomi (HyperOS 1.0/Android 14 a HyperOS 3.0/Android 16) |
| Detekce okolí přes Bluetooth | otestováno se dvěma telefony (našly se, potvrdily, uložily) |
| Server (účty, focus, body, zabití, štíty, sázky, okolí, blokování, nahlášení, žebříček, fotky, admin) | 142 automatických testů proti skutečnému PostgreSQL; typecheck a lint bez chyb |
| Multiplayerový klient | překládá se a odpovídá API; **celé zabití mezi dvěma telefony zatím není otestované od začátku do konce** |
| Připisování minut a štítů při zamčeném telefonu | opraveno (wake lock, viditelný stav serveru); **čeká na ověření na telefonu** |
| iOS | napsáno, **nikdy nepřeloženo ani nespuštěno** (potřebuje Xcode, placený účet Apple Developer a schválení Family Controls od Applu) |

## Soukromí a bezpečnost

- Historie soustředění, úkoly, statistiky a seznam povolených aplikací zůstávají v telefonu.
- Služba usnadnění čte jen název balíčku okna v popředí, nikdy obsah, a nic neodesílá.
- Bluetooth: token rotující každý den, žádná identita; nikdo vás nemůže sledovat déle než den.
- Server: hesla se hashují scryptem a nikdy se nevracejí ani nelogují; tokeny se ukládají jen jako hashe a lze je
  zrušit; neúspěšná přihlášení se trvale omezují; fotky se překódují a zbavují metadat; účty lze smazat se všemi daty.
  **Není obnovení hesla**, protože není e-mail.
- Admin oprávnění se ověřuje na serveru při každém požadavku (příznak `accounts.is_admin`); běžný uživatel dostane na
  admin cesty 404. Každá admin akce se zapisuje do `admin_audit`.
- Filtr přezdívek (česky a anglicky, včetně obcházení) v telefonu i na serveru; nahlášení se ukládají s důkazy
  k ruční kontrole.

## Známá omezení

- Server nevidí reálný svět: **fyzická blízkost a focus mód se nedají dokázat**. Relay útok nebo upravený klient může
  podvádět. Dva účty jedné osoby mohou „farmit“ zabití. Zmírnění jsou popsána v
  [`docs/multiplayer-api.md`](docs/multiplayer-api.md); Play Integrity / App Attest jsou plánované, ne postavené.
- Hráč se může vyhnout statusu wastemana tím, že nikdy neodešle ruční vypnutí (offline, zabitá aplikace).
- Stisk Home nebo Recents uvnitř povolené aplikace může krátce ukázat původní launcher.
- Xiaomi a další výrobci mohou omezovat Bluetooth na pozadí nebo zabíjet služby i přes výjimky.
- Server zatím nemá Dockerfile ani Helm chart; fotky jsou na lokálním disku a limity požadavků jsou na repliku,
  takže je bezpečná jen jedna replika. Před postupným nasazením na produkci viz poznámky k migracím
  (zděděné `players.token_hash`).
- Testovací APK povolují prosté HTTP (kvůli serveru na Macu v lokální síti) a jsou podepsané veřejným ladicím klíčem;
  pro vydání je nutný vlastní klíč a HTTPS.
- Denní žebříček řadí podle zabití; body (včetně ručních úprav adminem) se zobrazují ve statistikách.
- iOS nemá multiplayer ani Bluetooth. ID balíčků jsou zástupná (`com.example.focusmode`).
- Distribuce přes Google Play vyžaduje prohlášení pro službu usnadnění, službu na popředí (`specialUse`)
  a oprávnění Bluetooth; viz [`mobile/README.md`](mobile/README.md).
- Zatím nebyla zvolena licence.

## Plán

1. Test zabití mezi dvěma telefony od začátku do konce, potom opravy.
2. Admin panel: seznam hráčů, přejmenování, smazání fotky a oznámení dotčenému hráči.
3. Aktualizace aplikace bez kabelu (kontrola nové verze přímo v aplikaci) — nyní přeskočeno.
4. Dockerfile, Helm chart, objektové úložiště pro fotky, sdílené úložiště limitů — odloženo. Server dál používá lokální fotky a jednu repliku; automatické nasazování backendu je vypnuté.
5. Play Integrity, detekce anomálií ve dvojicích zabití.
6. Build pro iOS a později Bluetooth a multiplayer na iOS.

## Práce s Claude Code

Repozitář obsahuje nastavení Claude Code (`CLAUDE.md`, `.claude/`): agenty pro backend, databázi, migrace
a Kubernetes, hlídací hooky, které drží produkci jen pro čtení, a slash příkazy jako `/preflight`. Podrobnosti
v [`docs/workflow.md`](docs/workflow.md). Databázové migrace před commitem kontroluje agent `migration-reviewer`.
