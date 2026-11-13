# Focus Mode podklady pro informační web

Web má návštěvníkovi vysvětlit, jak Focus Mode pomáhá omezit rušivé aplikace, zda ho může používat na svém telefonu a jak začít bez znalosti vývoje. Úplný postup používání je v [uživatelském návodu](uzivatelsky-navod-cs.md). Tento podklad přidává návrh stránek, texty vhodné pro web a provozní údaje potřebné ke skutečné instalaci.

Veřejný název je zatím převzatý z konfigurace aplikace: **Focus Mode**. Texty odpovídají zdrojovému stavu `main` na commitu `9fffd8f` z 13. listopadu 2026. Jsou připravené pro nabídku **testovací Android verze**, ne pro prezentaci ověřeného vydání pro všechny telefony.

## Nejdřív doplnit skutečné údaje pro instalaci

Samotný informační web nezprovozní multiplayerový server. Současná Android aplikace navíc po úvodním průvodci požaduje přihlášení; dostupný server je proto potřeba také pro dokončení prvního nastavení. Nestačí nabídnout APK a předpokládat, že nový uživatel bez serveru projde do aplikace.

| Údaj | Co je známé | Co dát na veřejný web |
|---|---|---|
| Veřejný název | V aplikaci je Focus Mode; v grafických podkladech se objevuje také motiv PELYOS. | Jeden potvrzený název používaný v titulku, návodu a u tlačítek. |
| Instalační soubor | Workflow vytváří `focus-mode.apk` pro `arm64-v8a`. | Ověřený odkaz na konkrétní APK určené pro návštěvníky. |
| Aktuální vydání | Konfigurace uvádí 1.0.0; testovací soubor může být přepisován více buildy. | Datum vydání a označení buildu nebo commit, kterému soubor skutečně odpovídá. |
| Velikost a kompatibilita APK | Build je pro 64bitový ARM; vyzkoušeny jsou dva modely Xiaomi. | Velikost skutečného souboru, minimální Android z metadat APK a ověřené modely. |
| Server | Výchozí hodnota v klientovi je vývojové `http://localhost:3000`. | Skutečnou adresu dosažitelnou telefonem, ideálně veřejný HTTPS server. |
| Rozsah dostupnosti serveru | V dokumentaci je popsán i server na Macu přes místní Wi-Fi. | Pokud jde jen o místní test, napiš konkrétní podmínky přístupu do testovací sítě. |
| Podpora | Ve zdrojích není potvrzený veřejný kontaktní kanál. | Funkční kontakt a postup pro hlášení chyby. |
| Správa osobních dat | Funkce a ukládaná data vyplývají z kódu, konkrétní provozní pravidla nejsou určena. | Totožnost provozovatele, kontakt a skutečné informace o uchování a správě dat. |
| Stav testů | Android focus mód a okolí byly použity na dvou telefonech; celý herní zásah a poslední opravy zamčeného telefonu mají otevřené ověření. | Označení testovací verze a krátký přehled relevantních omezení. |

Dokud není použitelná adresa serveru a vydání APK, dej místo tlačítka slibujícího okamžitou instalaci možnost **Informace o testování**. Nabídka pro omezené testery může fungovat i se serverem v místní síti, pokud návštěvník podmínky dostane před stažením.

### Odkazy připravené v projektu

Projektový workflow používá následující cíle:

- [Stránka testovacího vydání android latest](https://github.com/Bobehska21/Praut-Telefon-appka/releases/tag/android-latest).
- [Předpokládaná přímá adresa souboru focus mode APK](https://github.com/Bobehska21/Praut-Telefon-appka/releases/download/android-latest/focus-mode.apk).

Jde o adresy odvozené z konfigurace workflow. Dostupnost aktuálního vydání ani jeho veřejné stažení se při přípravě podkladů nepodařilo ověřit. Před vložením odkazu do webu jej otevři bez přihlášení ke GitHubu a proveď instalaci na telefonu. Soukromý repozitář nebo chybějící soubor by návštěvníkovi stažení znemožnil.

Testovací vydání `android-latest` používá podle workflow veřejný ladicí podpis. Pro běžnou veřejnou distribuci nejprve připrav vydání podepsané vlastním klíčem; workflow podporuje vydání s tagem `android-v*` a příslušnými podpisovými údaji. Pouhý název „release APK“ neznamená, že soubor používá soukromý distribuční podpis.

## Navržená struktura webu

| Stránka | Účel | Hlavní obsah |
|---|---|---|
| Úvod | Vysvětlit aplikaci během několika vět. | Přínos, tři kroky použití, skutečné snímky aplikace, dostupnost Android testu. |
| Jak to funguje | Popsat běžné soustředění. | Profily, povolené aplikace, časovač, ochrana proti vypnutí, plány. |
| Instalace | Dovést uživatele od APK k první relaci. | Kompatibilita, stažení, oprávnění, účet, adresa serveru, zkušební relace. |
| Herní funkce | Vysvětlit motivaci i pravidla. | XP, místní a serverové body, wasteman, štíty, sázky, žebříček. |
| Návod a časté otázky | Pomoci s každodenním ovládáním. | Kompletní příručka a nejčastější potíže. |
| Soukromí a oprávnění | Ukázat konkrétní práci s daty. | Telefon oproti serveru, viditelnost profilu, citlivá oprávnění, smazání účtu. |
| Podpora a změny | Pomoci s chybami a aktualizacemi. | Kontakt, identifikace vydání, známá omezení, stručný seznam změn. |

Pro menší web můžeš stejné části použít jako sekce jedné stránky. Podrobný návod a soukromí mohou mít samostatnou adresu, aby se na ně dalo přímo odkazovat.

## Hotové texty pro úvodní stránku

### Hlavní nadpis

**Vyber si, co v telefonu potřebuješ, a soustřeď se.**

### Úvodní odstavec

Focus Mode je aplikace pro Android, která během soustředění ponechá dostupné vybrané aplikace a ostatní blokuje. Připrav si profil pro práci nebo učení, nastav délku relace a sleduj svůj pokrok. Když chceš, přidej i herní výzvy s lidmi v dosahu Bluetooth.

### Dostupnost

**Testovací verze pro Android.** Pro první nastavení potřebuješ účet a adresu dostupného serveru. Verze pro iPhone zatím není připravená k běžnému používání.

### Tlačítka

Po ověření instalačního vydání a serveru:

- **Stáhnout testovací APK**.
- **Jak aplikaci nainstalovat**.
- **Prohlédnout návod**.

Dokud instalační podmínky nejsou připravené, použij **Informace o testování** místo nefunkčního tlačítka ke stažení.

### Krátké popisy hlavních funkcí

**Profily podle situace**

Při práci potřebuješ jiné aplikace než při učení. Vytvoř si vlastní profily a v každém povol jen to, co chceš mít dostupné.

**Čas na soustředění**

Vyber 25, 50 nebo 90 minut, nastav vlastní délku nebo režim ukonči ručně. Pro pravidelné používání si připrav automatický plán.

**Pokrok, který vidíš**

Sleduj čas soustředění, denní cíl 90 minut a sérii aktivních dnů. Za mise a úspěchy získávej XP, úrovně a hodnosti.

**Dobrovolná hra v okolí**

Zapni herní funkci, Bluetooth a připojení k serveru. Potkávej další uživatele a vyzkoušej bodové výzvy, štíty nebo herní lov wastemanů.

### Tři kroky používání

1. **Povol potřebné aplikace.** V profilu si vyber například poznámky, kalendář nebo slovník.
2. **Spusť relaci.** Nastav čas a nech rušivé aplikace mimo dosah běžného otevření.
3. **Zkontroluj pokrok.** Po skončení převezmi splněné mise a sleduj svůj čas i sérii.

### Pro koho je aplikace

Pro studující při přípravě na zkoušky, pro lidi pracující na soustředěných úkolech i pro každého, kdo chce omezit automatické otevírání rušivých aplikací. Potřebné aplikace si vybíráš sám a nastavení můžeš přizpůsobit situaci.

## Hotový text pro instalační stránku

### Instalace testovací verze pro Android

Stáhni APK z odkazu provozovatele a otevři ho v telefonu. Pokud Android požádá o povolení instalace pro použitý prohlížeč nebo správce souborů, povol tento konkrétní zdroj a vrať se k instalaci. Stahuj pouze soubor, jehož původu důvěřuješ; v případě bezpečnostního upozornění ověř vydání u podpory.

Po instalaci projdi průvodce oprávněními. Pro spuštění jsou potřeba služba usnadnění, přístup k oznámením, zobrazování oznámení a výjimka z úspory baterie. Bluetooth je volitelné pro hru a hledání lidí v okolí.

Vytvoř účet bez e-mailu, ulož si heslo a zadej adresu serveru uvedenou u daného vydání. V Profilech potom povol potřebné aplikace, vyber 25 minut a spusť první relaci bez sázky s nastavením 1×.

Pod tlačítko ke stažení patří konkrétní údaje o vydání: podporovaný Android, architektura, velikost, datum, identifikace buildu, adresa serveru a odkaz na podrobný návod. Tyto údaje vyplň podle skutečně nabízeného APK.

## Hotové krátké odpovědi do častých otázek

### Funguje aplikace na iPhonu

Ověřené testovací používání je aktuálně zaměřené na Android. iOS část je rozpracovaná a nemá potvrzené vydání pro běžné uživatele. Bluetooth multiplayer pro iOS není implementovaný.

### Potřebuji účet

Ano. Současná Android verze po úvodním nastavení vyžaduje přihlášení uživatelským jménem a heslem. E-mail se nezadává. Vyhledávání okolních hráčů můžeš později vypnout.

### Potřebuji internet

Pro vytvoření účtu a multiplayer potřebuješ dostupný server. Již nastavený místní časovač a blokování mohou fungovat i bez spojení, ale herní minuty, body a odměny se nemusí započítat stejně jako místní odpočet.

### Proč aplikace potřebuje usnadnění a oznámení

Usnadnění umožňuje poznat nepovolenou aplikaci v popředí a vrátit tě na obrazovku soustředění. Přístup k oznámením slouží k odstranění oznámení nepovolených aplikací během režimu. Implementace k tomu používá původ aplikace, nikoli texty zpráv nebo hesla.

### Vrátí se oznámení po skončení režimu

Ne. Oznámení nepovolených aplikací se odstraňují a po skončení se neobnovují. Obsah samotných zpráv může zůstat dostupný uvnitř příslušné aplikace.

### Zablokuje aplikace telefonování

Telefonní aplikace, SMS a vybrané systémové součásti jsou mezi výjimkami blokování. Dostupnost potřebných funkcí si před delší relací ověř na vlastním telefonu.

### Co jsou XP a co body

XP získáváš za mise a úspěchy a určují úroveň i hodnost. Body vycházejí ze soustředění a herních událostí. Pokrok má místní výpočet bodů, zatímco multiplayerové body a podmínky potvrzuje server.

### Jak se stanu wastemanem

Při zapnutém multiplayeru ručně ukončíš běžící režim soustředění. Automatické doběhnutí časovače wastemana nevytvoří. Zachráníš se novým spuštěním soustředění.

### Kdy mohu herně zasáhnout jiného hráče

Potřebuješ alespoň 90 dnešních minut uznaných serverem. Cíl musí být dostupný přes Bluetooth, být wastemanem, mít zapnutý multiplayer a nemít imunitu. Mezi účty také nesmí být blokování.

### Jak získám štít

Za pět hodin připsaného soustředění v jedné relaci. Jedna relace přidělí nejvýše jeden štít a uložené mohou být tři. Štít automaticky pohltí platný útok bez bodové ztráty a přidá deset minut imunity.

### Jsou sázky za peníze

Ne. Současná aplikace používá pouze virtuální herní body. Násobič 1× znamená relaci bez sázky. Při 2×, 5× nebo 10× si vybíráš bodový vklad a předepsanou minimální délku časovače; server rozhodne o odměně nebo ztrátě.

### Je obnova hesla přes e-mail

Ne. Účet nemá e-mail, takže běžná e-mailová obnova není dostupná. Přihlašovací údaje si ulož do správce hesel.

### Aktualizuje se aplikace sama

Aktuální verze nemá automatické stahování nového APK přímo z aplikace. Nové ověřené vydání stáhneš z distribučního místa provozovatele a nainstaluješ ručně.

### Jak smažu účet

V aplikaci otevři Hráči, podzáložku Já a volbu Smazat účet a odejít. Potřebuješ spojení se serverem. Tato akce se liší od odhlášení a od smazání místní historie; u nahlášení mohou zůstat uložené důkazy pro moderaci.

## Podklady pro stránku soukromí

Použij věcný popis konkrétních funkcí:

„Profily, výběr povolených aplikací a místní historie se ukládají do telefonu. Při používání účtu server zpracovává herní profil, přihlašovací údaje v chráněné podobě, serverové minuty, body a související herní události. Pokud přidáš fotku nebo odešleš nahlášení, související data se ukládají na serveru. Přezdívku a vybrané profilové údaje mohou vidět ostatní hráči. Přihlašovací jméno není běžným veřejným hráčským údajem, ale mohou k němu mít přístup správci.“

„Bluetooth funkce používá dočasný kód měněný každý den a údaj o stavu. Neposkytuje mapu GPS souřadnic. Rádiové vysílání přesto umožňuje okolním zařízením rozpoznat přítomnost aplikace; denní změna kódu není zárukou úplné anonymity.“

Doplň skutečného provozovatele serveru, kontakt, umístění a dobu uchování dat, postup vyřízení žádostí a případné další služby použité samotným webem. Pokud web přidá analytiku, formuláře nebo další služby, jejich údaje nejsou pokryté popisem samotné aplikace. Text o funkcích nenahrazuje informace o konkrétním provozu.

## Co do webu nepřebírat ze starých textů

| Zavádějící tvrzení | Přesná formulace pro současný stav |
|---|---|
| Všechna data zůstávají pouze v telefonu. | Místní historie zůstává v telefonu; účet a multiplayer používají server. |
| Aplikace nevyžaduje účet. | Android po úvodním průvodci požaduje účet; multiplayerové hledání lze později vypnout. |
| Aplikace nikdy neposílá jiná oznámení než trvalý stav režimu. | Kromě stavu režimu používá oznámení o setkáních a herních nebo moderátorských událostech. |
| Přístupnost je vždy jen nepovinné rozšíření. | Aktuální Android kontrola ji vyžaduje před spuštěním režimu. |
| Každých pět hodin znamená další štít. | Nejvýše jeden štít za jednu pětihodinovou relaci a maximálně tři uložené. |
| Úspěšná sázka vždy zdvojnásobí všechny body. | Odměna navíc je `vklad × (násobič − 1)`. |
| Oběť vždy ztratí čtvrtinu aktuálně viditelného zůstatku. | Základ ztráty tvoří dnešní kladné příjmy; ztráta je omezená aktuálním čistým denním zůstatkem. |
| Po 90 minutách na displeji můžeš vždy útočit. | Potřebných 90 minut musí uznat server a musí být splněné i podmínky cíle. |
| Nikdo tě nemůže přes Bluetooth sledovat. | Identifikátor se mění každý den; nejde o absolutní záruku proti sledování nebo korelaci. |
| Stačí stáhnout APK a vše bude fungovat všude. | K prvnímu nastavení patří oprávnění, účet a dostupný server; herní funkce mají další podmínky. |
| Režim nejde nijak obejít. | Jde o dobrovolnou pomůcku, kterou majitel telefonu může vypnout systémovými zásahy. |
| Aplikace je plně otestovaná pro Android i iOS. | Android má omezené ověření na telefonech; iOS vydání a celý multiplayerový zásah nejsou potvrzené. |

Některé původní řetězce přímo v aplikaci dosud uvádějí používání bez účtu, jen místní data nebo nepovinnou přístupnost. Texty webu výše vycházejí ze současného chování přihlašování a kontroly oprávnění. Před veřejným vydáním je vhodné sjednotit také tyto řetězce v aplikaci; tato příprava dokumentace je nemění.

## Obrázky vhodné pro web

Použij vlastní snímky skutečné nabízené verze, ideálně v tomto pořadí:

1. Hlavní obrazovka s výběrem profilu a 25minutovou relací bez sázky.
2. Výběr povolených aplikací v profilu Učení.
3. Obrazovka soustředění s mřížkou povolených aplikací.
4. Pokrok se splněnou misí a tlačítkem Převzít.
5. Statistiky s přehledem týdne a sérií.
6. Hráči v okolí s vysvětlením stavů a serverových minut.
7. Přehled vlastních štítů a bodů.
8. Průvodce oprávněními pro instalační návod.

Pro soukromí na snímcích používej testovací přezdívky a fotky se souhlasem jejich uživatelů. Nezobrazuj přihlašovací heslo, tokeny nebo neveřejnou adresu serveru. U herních funkcí ukaž skutečný stav testovací verze, nikoli domyšlené obrazovky.

## Podklady pro vyhledávání a sdílení

**Titulek stránky:** Focus Mode – soustředění na Androidu a návod k instalaci

**Popis stránky:** Omez rušivé aplikace pomocí profilů a časovače. Poznej testovací Focus Mode pro Android, postup instalace APK a pravidla herních funkcí.

**Krátký text pro sdílení:** Focus Mode ponechá při soustředění dostupné jen vybrané aplikace. Vyzkoušej profily, časovač a mise; pro Android je připravený návod k testovací instalaci.

Cena, obchodní podmínky, veřejná licence, dostupnost v obchodech a datum plného vydání nejsou v tomto podkladu určeny. Nepřidávej jejich příslib do textu bez konkrétního rozhodnutí provozovatele.

## Zdroje a údržba obsahu

Návod a texty vycházejí především z těchto částí projektu:

- [Konfigurace a veřejný název aplikace](../mobile/app.json).
- [Postup sestavení a publikování APK](../.github/workflows/android-apk.yml).
- [Skutečně požadovaná oprávnění](../mobile/src/features/permissions.ts).
- [Registrace a přihlášení](../mobile/src/app/auth.tsx).
- [České názvy prvků aplikace](../mobile/src/i18n/cs.json).
- [XP a místní bodování](../mobile/src/features/progress/xp.ts).
- [Mise a týdenní výzvy](../mobile/src/features/progress/quests.ts).
- [Serverové bodování a ztráta při zásahu](../server/src/domain/points.ts).
- [Pravidla štítů](../server/src/domain/shields.ts).
- [Pravidla sázek](../server/src/domain/bets.ts).
- [Podrobná pravidla multiplayeru](multiplayer-api.md).
- [Odstraňování oznámení](../mobile/modules/focus/android/src/main/java/expo/modules/focus/FocusNotificationListener.kt).

Při každém nabízeném vydání porovnej web se skutečným APK: funkce, texty tlačítek, podmínky oprávnění, podpis, server a pravidla bodování. Udržuj jeden odkaz na aktuální uživatelský návod, aby se instalační informace na různých stránkách nerozcházely.
