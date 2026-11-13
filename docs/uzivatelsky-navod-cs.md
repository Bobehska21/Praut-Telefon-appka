# Focus Mode podrobný návod k používání

Focus Mode ti pomůže omezit vyrušování telefonem při práci, učení nebo odpočinku. Předem vybereš aplikace, které potřebuješ, a spustíš režim soustředění. Ostatní aplikace během něj telefon nahrazuje obrazovkou soustředění. Za pravidelnost získáváš herní pokrok a na Androidu se můžeš zapojit také do hry s lidmi v dosahu Bluetooth.

Tento návod popisuje současnou testovací aplikaci pro Android. Pro první přihlášení potřebuješ dostupný herní server a jeho adresu od provozovatele. iPhone zatím nemá ověřené vydání. Současná Android aplikace vyžaduje účet i tehdy, když později vypneš vyhledávání ostatních hráčů.

## K čemu se aplikace hodí

Aplikaci využiješ například při přípravě do školy, psaní, práci na projektu nebo večerním omezení sociálních sítí. Pro každou situaci si můžeš připravit jiný seznam povolených aplikací. Při učení si necháš poznámky a slovník, při práci kalendář a pracovní komunikaci.

Focus Mode ti vytváří překážku mezi automatickým sáhnutím po telefonu a otevřením rušivé aplikace. Úspěch závisí také na tom, co si povolíš: pokud v profilu necháš sociální síť nebo prohlížeč, můžeš je dál používat. Aplikace neposuzuje, zda se uvnitř povolené aplikace skutečně věnuješ práci.

Blokování je dobrovolná pomůcka. Uživatel může odebrat oprávnění, změnit nastavení systému nebo aplikaci odinstalovat. Nejde o zámek telefonu, který by odolal jeho majiteli.

## Co potřebuješ před instalací

- Telefon s Androidem a podporou aktuálně nabízeného APK. Současný automatický build vytváří balíček pro 64bitové procesory ARM, označované `arm64-v8a`; starší 32bitové telefony a zařízení s jinou architekturou nemusí být kompatibilní.
- Instalační soubor APK od provozovatele aplikace.
- Připojení k internetu nebo místní síti, ve které je dostupný server.
- Adresu serveru a vlastní uživatelské jméno s heslem.
- Bluetooth a příslušná oprávnění, pokud chceš vidět hráče v okolí.

Android focus mód byl vyzkoušen na dvou telefonech Xiaomi s Androidem 14 a 16. Chování dalších modelů, zejména na pozadí, se může lišit. Přesnou minimální verzi Androidu a velikost souboru ověř u konkrétního vydání APK.

## Instalace do Androidu

### Stažení souboru

1. Na telefonu otevři odkaz ke stažení poskytnutý provozovatelem.
2. Pokud odkaz vede na GitHub Releases, otevři příslušné vydání a jeho část **Assets**.
3. Stáhni soubor APK. Projektový postup sestavení ho pojmenovává `focus-mode.apk`.
4. Otevři stažený soubor z oznámení o dokončeném stahování nebo ze správce souborů.

Nestahuj soubor **Source code ZIP**. Ten obsahuje zdrojový kód a do telefonu se jako aplikace neinstaluje. Instalovatelné APK obsahuje samotnou aplikaci; běžný uživatel k jeho spuštění nepotřebuje USB kabel, vývojové nástroje ani připojený počítač. Server ale musí být dostupný samostatně.

### Povolení instalace

Pokud telefon instalaci z daného zdroje nepovoluje, otevři nastavení nabídnuté systémem a povol instalaci pro konkrétní aplikaci, přes kterou soubor otevíráš, například prohlížeč nebo správce souborů. Vrať se k APK a potvrď **Instalovat**. Názvy voleb závisí na telefonu.

Instaluj pouze balíček z důvěryhodného odkazu provozovatele. Pokud systém soubor označí za škodlivý nebo instalaci zablokuje, ověř vydání u provozovatele; tento návod nevyžaduje vypnutí Play Protect. Google popisuje možnosti instalace mimo obchod a kontroly aplikací v [nápovědě k instalaci](https://support.google.com/android/answer/9457058?hl=cs) a [nápovědě k Play Protect](https://support.google.com/android/answer/2812853?hl=cs).

### První otevření

Po instalaci otevři **Focus Mode**. Zobrazí se úvodní průvodce oprávněními. Některá nastavení proběhnou na systémové obrazovce; po jejich povolení se vrať zpět do aplikace. Samotné otevření nastavení ještě neznamená, že je oprávnění udělené.

## Oprávnění a jejich význam

Čtyři oprávnění jsou v současné Android aplikaci podmínkou zahájení soustředění. Volitelné kroky můžeš přeskočit.

| Oprávnění v průvodci | Je potřeba pro spuštění | K čemu slouží |
|---|---|---|
| Služba usnadnění | Ano | Zjišťuje aplikaci v popředí a vrací tě z nepovolené aplikace na obrazovku soustředění. Implementace používá název balíčku, nikoli text obrazovky. |
| Přístup k oznámením | Ano | Během soustředění odstraňuje oznámení nepovolených aplikací. Jejich text aplikace ke svému rozhodování nepoužívá. |
| Oznámení | Ano | Umožňuje průběžné oznámení běžící služby a zprávy související s herními událostmi. |
| Výjimka z úspory baterie | Ano | Pomáhá udržet režim a komunikaci se serverem při zamčeném telefonu. |
| Bluetooth | Ne | Umožňuje hledání a spojení s lidmi v okolí. |
| Výchozí domovská obrazovka | Ne | Umožňuje vést tlačítko Domů přes prostředí aplikace. |
| Přesné časovače | Ne | Pomáhají automatickému spuštění plánů v požadovaný čas. |

Přístup k oznámením a povolení zobrazovat oznámení jsou dvě různá oprávnění. Udělení jednoho nenahrazuje druhé. Systémová oprávnění mají širší možnosti než konkrétní použití ve Focus Mode, proto je uděluj pouze aplikaci, jejímuž původu důvěřuješ.

Oznámení nepovolených aplikací se během režimu **odstraňují**, nikoli odkládají do fronty. Po skončení soustředění se automaticky nevrátí. Samotný obsah zprávy může dál zůstat v aplikaci, která ji přijala.

### Když nejde zapnout služba usnadnění

U aplikací instalovaných mimo obchod může Android omezit citlivá nastavení. Pokud důvěřuješ původu APK a systém tuto možnost nabízí, otevři **Nastavení → Aplikace → Focus Mode → nabídka dalších možností → Povolit omezená nastavení**. Poté se vrať do nastavení usnadnění a zapni službu Focus Mode. Přesné umístění se mezi telefony liší. [Postup vysvětluje Google](https://support.google.com/android/answer/12623953?hl=cs).

Po přeinstalování nebo změně systémového nastavení oprávnění znovu zkontroluj. Pokud některé chybí, hlavní obrazovka nabízí jeho povolení.

## Účet a připojení k serveru

### Založení účtu

Po dokončení úvodního průvodce se na Androidu objeví **Přihlášení**.

1. Klepni na **Nemáš účet? Vytvoř si ho**.
2. Vyplň uživatelské jméno o délce 3–20 znaků. Použij písmena bez diakritiky, číslice, tečku, podtržítko nebo pomlčku; mezery nejsou povolené.
3. Zadej heslo dlouhé 8–128 znaků a zopakuj ho.
4. Do pole **Adresa serveru** vlož adresu od provozovatele, včetně `https://` nebo jiného výslovně uvedeného protokolu.
5. Klepni na **Vytvořit účet**.

E-mail se nezadává. Proto aplikace nemá běžnou obnovu zapomenutého hesla přes e-mail. Přihlašovací údaje si ulož do správce hesel.

Uživatelské jméno slouží k přihlašování. Ostatní hráči vidí veřejnou přezdívku, kterou upravíš v Nastavení; přihlašovací jméno mohou při správě účtů vidět administrátoři. Zpočátku se jako přezdívka může použít i tvoje uživatelské jméno, pokud vyhovuje pravidlům.

### Co vyplnit do adresy serveru

Použij adresu konkrétního provozovaného serveru. Účet i jeho herní data patří k tomuto serveru; zadání jiné adresy nepřesune účet ani body.

Výchozí `http://localhost:3000` je vývojová hodnota. Na běžném telefonu znamená samotný telefon, nikoli počítač vývojáře. Bez zvláštního vývojového propojení ji nepoužívej jako adresu vzdáleného serveru.

Pokud jde o testování přes Wi-Fi, provozovatel ti může dát adresu serveru na počítači v místní síti. Telefon se musí do této sítě připojit a počítač se spuštěným serverem musí zůstat dostupný. Takové připojení nemusí fungovat po přepnutí na mobilní data nebo jinou Wi-Fi. Veřejné používání mimo tuto síť vyžaduje veřejně dostupný server.

### Přihlášení na dalším telefonu

Použij stejné uživatelské jméno, heslo a server. Nové přihlášení zneplatní dřívější přihlášení účtu. Počítej s jedním aktivním telefonem na účet. Místní profily, historie a XP se mezi zařízeními automaticky nesynchronizují.

## Rychlý začátek prvního soustředění

1. V záložce **Profily** otevři **Učení**.
2. Zaškrtni například poznámky, slovník a kalkulačku. Povol jen aplikace, které při učení potřebuješ.
3. Vrať se na hlavní obrazovku a vyber profil **Učení**.
4. Nastav **25 minut** a násobič **1×**, tedy bez bodové sázky.
5. Klepni na tlačítko pro spuštění režimu.
6. Vyzkoušej otevřít povolenou aplikaci a potom nepovolenou. Nepovolená by měla být nahrazena obrazovkou soustředění.
7. Nech časovač doběhnout. Poté otevři **Pokrok**, zkontroluj mise a případnou odměnu převezmi.

První pokus udělej v klidné situaci a ověř, že na svém telefonu dosáhneš na potřebné aplikace. Pro výuku používání není potřeba začínat dlouhou relací ani sázkou.

## Přehled obrazovek

| Obrazovka | Co v ní najdeš |
|---|---|
| Hlavní obrazovka soustředění | Spuštění a ukončení, výběr profilu, délku relace, denní cíl, přehled serverových minut a štítů při zapnuté herní funkci. |
| Pokrok | Úroveň, hodnost, XP, místní body, denní mise, týdenní výzvy, úspěchy a vstup do statistik. |
| Hráči | Podzáložky **V okolí**, **Žebříček** a **Já**. |
| Profily | Seznamy povolených aplikací a tlačítko **Plán**. |
| Nastavení | Ochranu proti vypnutí, jazyk, přezdívku a vyhledávání uživatelů v okolí. |
| Admin | Správu hráčů; zobrazí se jen účtům, kterým oprávnění přiznal server. |

**Plán** a **Statistiky** mají vlastní obrazovky, ale nemají samostatná tlačítka ve spodní liště. Otevírají se přes Profily a Pokrok.

## Profily a povolené aplikace

Profil je pojmenovaný seznam aplikací dostupných během soustředění. Předpřipravené jsou **Práce**, **Učení** a **Spánek**.

### Úprava existujícího profilu

Otevři **Profily**, klepni na profil a případně uprav jeho název. V seznamu aplikací zaškrtni ty, které chceš ponechat dostupné; můžeš použít vyhledávání. Změny se ukládají průběžně, není potřeba hledat tlačítko Uložit. Změny profilu pro další relaci prováděj před jejím spuštěním.

### Vlastní profil

V části Profily napiš název a klepni na **Nový profil**. Otevře se výběr aplikací pro nový profil. Můžeš si tak připravit například „Psaní“, „Čtení“ nebo „Zkouškové“.

Profil lze smazat, pokud není jediný a právě podle něj neběží relace. Profil bez vybraných aplikací není automaticky chybný: po zapnutí v něm zůstanou především systémové výjimky. Aplikace na prázdný výběr upozorní.

Telefonní a SMS aplikace a vybrané systémové součásti patří mezi výjimky blokování. Konkrétní dostupnost telefonování, SMS a dalších potřebných funkcí si před delším používáním ověř na svém zařízení; nespoléhej na obecný seznam jako na záruku chování všech telefonů.

## Délka relace a vypnutí režimu

Vybrat můžeš předvolby **25, 50 nebo 90 minut**, vlastní počet minut nebo režim **dokud nevypnu**. Časovaná relace skončí automaticky. U režimu bez konce jej ukončíš ručně.

Během relace uvidíš stav režimu a u časovače zbývající čas. Na Androidu je dostupná také obrazovka s povolenými aplikacemi. Po stisknutí Domů nebo zobrazení posledních aplikací může na některých telefonech krátce probliknout běžný launcher.

### Ochrana proti rychlému vypnutí

V **Nastavení → Ochrana proti vypnutí** vybereš jednu z možností:

- **Žádná:** zastavení proběhne bez dalšího kroku.
- **Odpočítávání 30 s:** před potvrzením ukončení musíš počkat.
- **Opsání věty:** aplikace zobrazí větu, kterou je potřeba přepsat.

Ochrana se týká ukončení přes ovládání aplikace. Nezabraňuje změnám systémových oprávnění nebo odinstalování.

Ruční vypnutí běžícího režimu má při zapnutém multiplayeru také herní důsledek: může z tebe udělat wastemana. Platí to i pro ruční ukončení režimu bez časového limitu. Běžné doběhnutí časovače tento stav nevyvolává.

## Automatické plány

1. Na hlavní obrazovce vyber profil, který chceš pro plán používat.
2. Otevři **Profily → Plán → Přidat plán**. Nový plán převezme právě vybraný profil.
3. Zvol dny v týdnu a nastav časy **Od** a **Do**.
4. Čas upravuješ tlačítky plus a minus po 30 minutách.
5. Zkontroluj přepínač **Zapnuto**.

Nový plán je přednastavený na pracovní dny 9:00–17:00 a hned zapnutý, proto jej po přidání uprav. Změny se ukládají průběžně. Rozmezí může přecházet přes půlnoc; den označuje začátek daného intervalu.

Aby mohl plán běžet spolehlivě při zavřené aplikaci, ponech potřebná oprávnění a podle možností telefonu povol přesné časovače. Úsporné režimy výrobce mohou automatické spouštění omezit. Přesnost si nejdřív vyzkoušej na krátkém zkušebním plánu. Přidání plánu nenastavuje bodovou sázku.

## Denní cíl a statistiky

Denní cíl je **90 minut soustředění**. Můžeš ho nasbírat v několika relacích; nemusíš mít jednu souvislou relaci dlouhou 90 minut. Ukazatel se počítá pro místní kalendářní den a o půlnoci začíná nový den.

Přes **Pokrok → Statistiky** uvidíš dnešní dobu soustředění, zaznamenané pokusy otevřít blokovanou aplikaci, přehled posledních sedmi dnů a sérii aktivních dnů. Pro aktivní den série potřebuješ alespoň pět minut soustředění. Prázdný dnešek ještě sám o sobě nerozbije sérii navazující na včerejšek.

Počet blokovaných pokusů je orientační. Ukazuje zaznamenané události, nikoli přesný čas strávený snahou otevřít aplikaci.

## XP a body mají různé účely

### XP a úrovně

XP získáváš za převzaté odměny z misí a za odemčené úspěchy. Samotné minuty soustředění nepřidávají XP přímo. Minuty ale pomáhají splnit mise a úspěchy, za které XP dostaneš.

Každý den se objeví tři mise různých obtížností. Mohou chtít například 20, 45 nebo 90 minut soustředění, dokončení relací nebo ranní soustředění. Splněnou misi otevři v Pokroku a klepni na **Převzít**. Týdenní výzvy zahrnují 300 minut soustředění a pět aktivních dnů v týdnu; každá přináší 150 XP.

Úspěchy zahrnují první pětiminutové soustředění, dokončené relace, delší série nebo celkový čas. Podmínky některých úspěchů jsou přesnější než jejich krátký název: například Ranní ptáče vyžaduje začátek před 7:00 a alespoň 15 minut soustředění.

| Úroveň | Hodnost |
|---|---|
| 1–2 | Nováček |
| 3–4 | Učedník |
| 5–6 | Adept |
| 7–9 | Strážce |
| 10–14 | Mistr |
| 15 a více | Velmistr |

### Místní body v Pokroku

Pokrok má vlastní výpočet bodů z historie telefonu: základ je jeden bod za celou minutu, přičemž základní část je omezena na 120 minut jedné relace. Nad denní cíl se připočítává bonus jeden bod za každou minutu nad 90 minut.

Místní body v Pokroku nejsou úplným výpisem multiplayerového účtu. Nemusí odpovídat bodům v **Hráči → Já**, protože se počítají odlišně a nezahrnují stejné herní změny.

### Body a minuty potvrzené serverem

Pro multiplayer rozhoduje serverový přehled. Při pravidelném potvrzování soustředění přidává server jeden bod za minutu do 90 minut denně a dva body za další minuty téhož dne. Přidává také herní odměny a zohledňuje ztráty, sázky nebo zásahy administrátora. Serverový výpočet základních minut nemá stejný dvouhodinový limit jedné relace jako místní Pokrok.

Příklad bez dalších událostí: 90 minut potvrzených serverem znamená 90 bodů. Celkem 100 minut znamená 110 bodů, protože posledních deset minut přidá dvacet bodů.

Na hlavní obrazovce při zapnuté herní funkci sleduj serverem uznané dnešní minuty a ikony štítů. Vlastní odpočet může běžet, i když server není dostupný. Herní body jsou virtuální; v současné aplikaci není nákup bodů ani výplata peněz.

## Hráči v okolí

V **Nastavení → Zjišťovat uživatele v okolí** zapni vyhledávání a povol Bluetooth. Ponech Bluetooth zapnuté i v systému. Na novějších telefonech se oprávnění může zobrazovat jako přístup k blízkým zařízením; starší Android může pro vyhledávání vyžadovat oprávnění k poloze.

Telefon přes Bluetooth vysílá dočasný identifikátor a stav. Tento kód se denně mění. Nejde o sdílení souřadnic GPS, ale už samotný Bluetooth kontakt vypovídá o tom, že jsou zařízení v rádiovém dosahu.

Aplikace má dvě související funkce:

- Setkání s uživatelem přes Bluetooth může nabídnout oznámení s přijetím nebo odmítnutím. Po přijetí se načte jeho základní profil; záznam potkání najdeš v Pokroku.
- **Hráči → V okolí** zobrazuje multiplayerové účty nalezené v dosahu a rozpoznané serverem. Tento seznam vyžaduje spojení se serverem a nemá před každým zobrazením stejný potvrzovací dialog jako oznámení o setkání.

Dosah závisí na telefonu, překážkách a rádiovém prostředí. Seznam se nemusí aktualizovat okamžitě. Nejde o mapu lidí ani přesný ukazatel vzdálenosti.

Vypnutím přepínače se vypíná hledání okolí a veřejná účast v multiplayeru. Účet se tím nemaže a požadavek přihlášení v Android aplikaci zůstává.

## Multiplayer Ulov wastemana

Jde o herní střetnutí mezi lidmi v okolí. Výrazy „zabít“, „smrt“ nebo „útok“ označují změny virtuálních bodů a statistik; neznamenají pokyn ke skutečnému fyzickému jednání.

### Stavy hráče

| Stav | Co znamená |
|---|---|
| V režimu | Hráč má aktivní soustředění. |
| Mimo režim | Hráč právě nemá aktivní soustředění a není vedený jako wasteman. |
| Wasteman | Hráč ručně ukončil běžící režim a může být herním cílem, pokud splňuje i ostatní podmínky. |
| Imunní | Hráče dočasně nelze úspěšně zasáhnout. |

Wastemanem se stáváš ručním ukončením běžícího focus módu, nikoli automatickým doběhnutím časovače. Ze stavu wastemana se dostaneš novým spuštěním soustředění. Samotné otevření aplikace nestačí. Imunita může dočasně chránit i hráče, který dál zůstává wastemanem.

### Podmínky úspěšného zásahu

Potřebuješ alespoň **90 minut soustředění potvrzených serverem v daném dni**, dostupný server a spojení přes Bluetooth s cílem. Cíl musí být wasteman, mít zapnutý multiplayer a nesmí být imunní. Mezi účty také nesmí být blokování. Vlastní účet nemůžeš zasáhnout.

1. Otevři **Hráči → V okolí**.
2. Vyber dostupného wastemana.
3. Klepni na **Zabít**.
4. Počkej na výsledek. Telefony musí zůstat v rádiovém dosahu.

Pokud nemáš dost serverových minut, aplikace ukáže, kolik chybí. Když hráč odejde z dosahu, začne se znovu soustředit nebo ho mezitím zasáhne někdo jiný, akce se nemusí podařit. Výsledek ověřuje server.

### Body a imunita

Při běžném úspěšném zásahu dostane útočník **50 bodů**. Cíl přijde o 25 % dnešních kladných bodových příjmů, zaokrouhlených dolů; ztráta přitom nepřesáhne jeho aktuální čistý denní bodový zůstatek. Nejde tedy vždy o čtvrtinu čísla, které po předchozích ztrátách právě vidí jako dnešní body. Po zásahu je cíl **jednu hodinu imunní**.

Příklad bez předchozích ztrát: hráč dnes získal 100 bodů a všech 100 mu zbývá. Zásah mu odebere 25 bodů, zbude 75 a útočník získá 50 bodů. Tato dvě čísla nejsou přímým převodem stejné částky mezi účty.

Denní žebříček v **Hráči → Žebříček** řadí hráče podle počtu úspěšných zabití za daný den, nikoli podle XP nebo bodů. Soukromé série a úrovně mají jiný význam než pořadí lovců.

Den žebříčku se řídí časovou zónou serveru; výchozí nastavení projektu používá pražský čas. Při používání v jiné časové zóně se jeho půlnoc nemusí shodovat s půlnocí místního denního cíle.

## Štíty

Jeden štít získáš za **pět hodin serverem připsaného soustředění v jedné nepřerušené relaci**. Pět samostatných hodinových relací podmínku nesplní. Jedna relace může přidělit nejvýše jeden štít, i když trvá deset hodin. Uložené mohou být maximálně tři štíty; při plném počtu další nepřibude.

Štít se použije automaticky při jinak platném útoku. Spotřebuje se jeden štít, cíl neztratí body a útočník nezíská bodovou odměnu. Cíl dostane deset minut imunity. Útok pohlcený štítem se nepočítá jako běžné úspěšné zabití a smrt.

Počet vlastních štítů uvidíš na hlavní obrazovce a v **Hráči → Já**. Pět hodin na místním časovači nemusí znamenat pět hodin uznaných serverem, zejména při výpadcích spojení. Dlouhá relace je herní podmínka pro štít, nikoli požadavek pro běžné používání aplikace.

## Bodové sázky na relaci

Sázka je dobrovolný závazek dokončit zvolenou relaci. Pracuje pouze s virtuálními body. Je dostupná v Android multiplayeru; výběr **1×** znamená běžnou relaci bez sázky.

| Násobič | Nejkratší povolený časovač | Odměna navíc při úspěchu za vklad 10 bodů |
|---|---|---|
| 1× | Bez dodatečného omezení sázkou | Žádná sázková odměna |
| 2× | 30 minut | +10 bodů |
| 5× | 75 minut | +40 bodů |
| 10× | 150 minut | +90 bodů |

Před spuštěním zvol násobič, časovač a počet vsazených bodů. Potřebuješ alespoň jeden bod a nemůžeš vsadit více, než činí tvůj kladný čistý zisk za dnešní den. Režim **dokud nevypnu** není pro sázku přípustný, protože nemá určený konec.

Odměna navíc se počítá jako `vklad × (násobič − 1)`. Za vklad 20 bodů při 5× tedy dostaneš při úspěchu navíc 80 bodů; běžné body za soustředění se počítají samostatně. Při neúspěchu můžeš ztratit vsazenou částku, nejvýše však čistý denní zůstatek použitý při serverovém vyhodnocení. Násobič nezvyšuje odměnu za zabití.

Úspěch posuzuje server podle připsaného času, ne pouze podle odpočtu na displeji. Výpadek spojení, ztráta serverové relace nebo nedostatek připsaného času může sázku zmařit i v případě, že telefon doběhl k nule. Sázky proto používej až po ověření stabilního spojení; pro první seznámení ponech 1×.

## Veřejný profil a správa účtu

### Přezdívka

V **Nastavení → Přezdívka** zvol veřejné jméno do 20 znaků. Povolená jsou písmena latinky, číslice, mezera, tečka, podtržítko a pomlčka. Nevhodné přezdívky filtr odmítá. Prázdná přezdívka může být ostatním zobrazena jako **Anonym**.

### Fotka

V **Hráči → Já** použij **Z galerie** nebo **Z foťáku**. Pořízení fotky vyžaduje oprávnění k fotoaparátu. Volbou **Odebrat** vlastní fotku odstraníš a vrátíš výchozí avatar. Profilová fotka je nepovinná. Server ji zmenší, překóduje a odstraní zpracovávaná obrazová metadata.

### Blokování a nahlášení

V dalších možnostech hráče můžeš vybrat **Blokovat** nebo **Nahlásit**. Nahlásit lze přezdívku, fotku nebo hráče. Blokování omezí vzájemnou herní interakci; seznam najdeš v **Hráči → Já → Zablokovaní hráči**, kde lze blokování také zrušit.

Nahlášení se uloží pro kontrolu správci. Neznamená okamžité automatické potrestání. Pro kontrolu se může uchovat kopie nahlášené přezdívky a fotky.

### Zásahy správce

Správce s příslušným oprávněním může upravit body, přejmenovat nevhodný profil nebo odstranit profilovou fotografii. O změně přezdívky nebo odstranění fotky aplikace posílá dotčenému hráči oznámení. Záložka Admin není dostupná běžným účtům.

### Odhlášení a smazání

**Hráči → Já → Odhlásit se** ukončí přihlášení, účet na serveru ponechá. Android aplikace se vrátí na přihlašovací obrazovku.

**Hráči → Já → Smazat účet a odejít** po potvrzení odstraní účet a navázaná osobní herní data ze serveru. Anonymizované odkazy na některé herní události a důkazy u nahlášení mohou zůstat. Před smazáním potřebuješ funkční spojení se serverem. Jestli se objeví chyba spojení, samotné odhlášení telefonu ještě nepotvrzuje smazání na serveru.

Smazání účtu není totéž co smazání místních profilů, historie a XP v telefonu. Aplikace nemá vlastní uživatelský export ani automatické přenesení této místní historie do nového zařízení. Při odinstalování nebo smazání dat aplikace o ni můžeš přijít.

## Používání bez internetu

Již nastavené místní blokování a časovač mohou fungovat bez připojení. První přihlášení nebo registrace však dostupný server vyžadují. Bez spojení nemusí fungovat multiplayerový seznam, fotografie, žebříček ani ověření herní akce.

Místní historie a serverové herní minuty jsou oddělené. Server omezuje připsání za opožděná hlášení, takže ztracenou dobu nemusí doplnit celou. Telefon se některé události pokouší odeslat později, ale to není záruka plného zpětného započítání bodů, sázek nebo štítů. Při upozornění na nedostupný server si zkontroluj připojení a adresu.

## Aktualizace aplikace

V aktuální verzi není automatická kontrola a instalace nového APK přímo v aplikaci. Aktualizaci stáhni ze stejného důvěryhodného distribučního místa a otevři ji v telefonu. Android dovolí aktualizaci existující instalace, pokud balíček a podpis odpovídají a vydání splňuje podmínky systému.

Když systém hlásí konflikt s nainstalovaným balíčkem, kontaktuj provozovatele kvůli správnému souboru. Změna podpisu mezi testovací a budoucí distribuční verzí může vyžadovat odinstalování. To může odstranit místní profily a historii, proto odinstalování nepoužívej jako první pokus o běžnou aktualizaci.

Po aktualizaci zkontroluj oprávnění, správnou adresu serveru a krátkou zkušební relaci. Dostupnost aktualizace ověřuj podle vydání, které provozovatel označil k používání, nikoli pouze podle obecného čísla verze v aplikaci.

## Nejčastější potíže

### Aplikace není kompatibilní nebo ji nelze nainstalovat

Ověř, že stahuješ soubor APK a že ho telefon stáhl celý. Současné automatické APK je pouze pro `arm64-v8a`. Konflikt s existující instalací může znamenat jiný podpis nebo nesprávnou verzi; požádej o správné vydání. Pokud instalaci blokuje systémová ochrana, ověř původ souboru u provozovatele.

### Registrace nebo přihlášení nefunguje

Zkontroluj adresu serveru, síť a správné jméno s heslem. Obsazené jméno při registraci nahraď jiným. Pokud se připojuješ k serveru na místní Wi-Fi, server musí běžet a telefon k němu musí mít přístup. Po mnoha chybných pokusech chvíli počkej. Zapomenuté heslo nejde obnovit přes e-mail.

### Soustředění nejde spustit

Na hlavní obrazovce projdi chybějící oprávnění. Zkontroluj také, zda nemáš zapnutou sázku s příliš krátkým časovačem nebo příliš vysokým vkladem. Pro běžný start vyber 1×. Prázdný profil je upozornění, nikoli náhrada za udělení oprávnění.

### Nepovolená aplikace zůstává dostupná

Ověř, že soustředění skutečně běží a že aplikaci nemáš zaškrtnutou v používaném profilu. Zkontroluj systémovou službu usnadnění a případné omezení služby po přeinstalování. Krátké probliknutí původní obrazovky může být vlastností konkrétního zařízení; trvalé selhávání popiš podpoře.

### Režim se vypíná nebo serverové minuty nepřibývají při zamčení

Zkontroluj výjimku z úspory baterie, případná další omezení běhu na pozadí od výrobce telefonu a spojení se serverem. Porovnej místní odpočet se serverovou kartou. Přesné názvy dodatečných přepínačů se liší podle výrobce. Spolehlivost přičítání při zamčeném telefonu ještě vyžaduje ověření na konkrétním modelu.

### Nevidím hráče v okolí

Oba telefony musí mít kompatibilní aplikaci, zapnuté Bluetooth, udělená oprávnění a zapnuté vyhledávání okolí. Pro multiplayerový seznam se oba připojují ke stejnému serveru. Přibliž zařízení a vyčkej na obnovení seznamu; zdi a úsporné režimy mohou spojení zhoršit. Zablokované nebo skryté účty se nemusí zobrazit.

### Mám 90 minut, ale nemohu útočit

Podmínka se posuzuje podle dnešních minut uznaných serverem, ne podle místního cíle nebo celkové historie. Zkontroluj serverový přehled a dostupnost cíle. Hráč může být imunní, mít vypnutý multiplayer nebo už nebýt wastemanem.

### Útok nepřidal body

Cíl mohl použít štít; pak se zobrazí zpráva o pohlcení útoku a body se nepřesunují. Jinak ověř, zda byl zásah serverem skutečně potvrzen. Ztráta Bluetooth nebo souběžný útok jiného hráče může způsobit neúspěch.

### Po dokončení časovače nemám sázkovou odměnu nebo štít

Časovač v telefonu není jedinou podmínkou. Pro odměnu musí server uznat potřebný čas v konkrétní relaci. Zkontroluj připojení, stav účtu a serverové minuty. Více kratších relací se pro pětihodinový štít nesčítá a jedna dlouhá relace přidělí nejvýše jeden štít.

### Ztratila se oznámení ostatních aplikací

To je při zapnutém blokování oznámení zamýšlené chování pro nepovolené aplikace. Odstraněná oznámení se po skončení režimu neobnovují. Potřebnou aplikaci si pro další relaci přidej mezi povolené.

### Přihlášení přestalo fungovat po použití jiného telefonu

Nové přihlášení stejného účtu ruší starší přihlášení. Znovu se přihlas na telefonu, na kterém chceš účet používat. Nepočítej se souběžným hraním stejného účtu na dvou zařízeních.

## Soukromí v praxi

| Údaj | Kde se používá nebo uchovává |
|---|---|
| Profily, povolené aplikace, místní historie, mise a XP | V telefonu; aplikace pro ně nemá vlastní cloudovou synchronizaci. |
| Identifikátor Bluetooth a stav | Vysílají se do okolí. Identifikátor se mění denně, ale okolní zařízení stále mohou zjistit přítomnost vysílající aplikace. |
| Přezdívka a základní herní profil | Sdílejí se podle zapnutých funkcí přes Bluetooth a multiplayerový server. |
| Účet, hash hesla, bodové události, serverové minuty a herní statistiky | Na serveru provozovatele. |
| Profilová fotka | Na serveru, kde slouží k zobrazení oprávněným uživatelům; při nahlášení může vzniknout kopie pro moderaci. |
| Přihlašovací jméno, nahlášení a záznamy správy | Mohou být dostupné pověřeným správcům serveru. |

Aplikace pro své blokování používá názvy aplikací v popředí a u oznámení původní aplikaci; implementace nečte texty zpráv ani hesla. To však neznamená, že při používání účtu všechna data zůstávají pouze v telefonu. Denně měněný Bluetooth kód není zárukou úplné anonymity nebo nemožnosti sledování.

Podrobnosti o provozovateli, době uchování serverových dat a kontaktu pro jejich správu patří k informacím konkrétního provozovaného serveru. Neposílej přihlašovací heslo do hlášení chyby ani do veřejné diskuse.

## Současná omezení testovací verze

- Ověřené používání je zaměřené na Android a omezený počet telefonů. iOS vydání zatím není připravené k doporučení běžným uživatelům.
- Kompletní herní zásah mezi dvěma telefony dosud nemá potvrzené ověření celého postupu v reálném provozu.
- Připisování minut a štítů se zamčeným telefonem závisí také na síti a správě baterie; jeho poslední opravy čekají na ověření na telefonech.
- Aplikace neověřuje skutečnou lidskou pozornost. Bluetooth spojení a serverové kontroly nejsou úplnou ochranou proti upraveným klientům nebo spolupracujícím účtům.
- Veřejný server, obchodová distribuce a automatické aktualizace nejsou samotným stažením zdrojového kódu zajištěné. Používej vydání a server, které provozovatel výslovně určil k testování.

## Co uvést při hlášení problému

Napiš model telefonu, verzi Androidu, používané vydání aplikace, zda jsi byl na Wi-Fi nebo mobilních datech, stav oprávnění a přesný postup, po kterém chyba vznikla. U problémů s body přidej přibližný čas události a rozdíl mezi místním časovačem a serverovými minutami. Přilož přesné znění chybové zprávy, nikoli své heslo nebo přihlašovací token.
