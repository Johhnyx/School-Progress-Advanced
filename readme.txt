# School Progress - README

Tento dokument popisuje, jak funguje projekt **School Progress**, jak jsou propojené jednotlivé bloky, odkud se berou data, jaké mechaniky používá aplikace a jak projekt bezpečně upravovat bez rozbití starších částí.

---

## 1. Co je School Progress

School Progress je jedno-stránková webová aplikace v jednom `index.html`, která funguje jako vlastní dashboard nad školním rozvrhem. Je to kombinace:

- přehledu postupu školou,
- živého denního stavu,
- týdenního rozvrhu,
- panelu událostí,
- Cáfa Trackeru,
- sanity systému,
- leaderboardu,
- skinů / theme systému,
- několika meme / easter egg prvků.

Projekt je záměrně udělaný jako **single-file app**:

- HTML = struktura stránky
- CSS = vzhled, layout, theme systém
- JavaScript = logika, data, výpočty, rendering, localStorage

To má výhodu, že se to snadno přenáší. Nevýhoda je, že když se něco upraví nešetrně, může se rozbít několik věcí najednou.

---

## 2. Co všechno projekt používá

### Hlavní soubor
- `index.html`

To je celý dashboard. Obsahuje:
- HTML strukturu
- všechny styly
- všechny skripty

### Vedlejší lokální soubory
- `MinecraftTextSource.txt` - zdroj splash textů pod titulkem
- `LeaderboardAb.txt` - textový soubor pro leaderboard
- `Monocraft.ttf` - font pro Minecraft splash text
- obrázky pro themes:
  - `loona.png`
  - `sobokill.png`
  - `KasparnaKart.png`
  - `BattleCats.png`

### Backend API
Dashboard používá Cloudflare Worker endpointy:

- class timetable:
  - `https://bakalariapi.janpilat-bp.workers.dev/api/timetable?class=5A&type=Actual`
- teacher timetable:
  - `https://bakalariapi.janpilat-bp.workers.dev/api/timetable?teacher=UV069&type=Actual`

Frontend neparsuje Bakaláře přímo. Dělá to backend worker a vrací už JSON.

---

## 3. Vysoká architektura projektu

Aplikace má 3 hlavní vrstvy:

### A) Vizuální vrstva
To je HTML + CSS:
- layout stránky
- karty / bloky
- info panel
- rozvrh grid
- tlačítka
- themes

### B) Stav aplikace
To je JavaScript objekt `state` + localStorage.

`state` drží například:
- načtený class timetable
- teacher timetable
- marks / events
- stav zdroje dat
- aktivní info page
- režim sanity grafu

LocalStorage drží například:
- theme
- mode title
- UI scale
- visibility toggle stavu jednotlivých bloků
- sanity log
- sanity mode
- aktivní info page

### C) Datová / logická vrstva
To jsou funkce, které:
- načítají backend data
- renderují rozvrh
- počítají progress bary
- řídí daily progress
- počítají sanity průběh
- rozhodují, co ukáže Cáfa Tracker
- načítají leaderboard

---

## 4. Hlavní sekce stránky

### 4.1 Title area
Obsahuje:
- hlavní title (`School Progress`)
- splash text pod ním
- settings button

#### Režimy title
Funkce `applyTitleMode(mode)` přepíná 3 režimy:

- `normal` -> `School Progress`
- `nonchalant` -> `Bakaláři, kdyby nebyly mid`
- `freaky` -> `Kdy to utrpení skončí`

V nonchalant režimu je slovo `Bakaláři` barvené přes CSS proměnnou `--bakalariBlue`.

#### Splash text
Funkce `loadMinecraftSplash()`:
- načte `MinecraftTextSource.txt`
- vezme náhodný řádek
- pokud soubor nejde načíst, použije fallback texty

---

### 4.2 Settings panel
Obsahuje:
- výběr theme
- výběr mode
- změnu UI scale
- toggly pro viditelnost jednotlivých bloků
- stav načtení rozvrhu a trackeru

#### Co settings ukládají
Do localStorage se ukládá:
- `sp_theme`
- `sp_mode`
- `sp_ui_scale`
- `sp_toggle_tt`
- `sp_toggle_daily`
- `sp_toggle_info`
- `sp_toggle_tracker`
- `sp_info_page`
- `sp_sanity_mode`

To znamená, že stránka si pamatuje svůj stav mezi reloady.

---

### 4.3 Progress bars
Dashboard má 2 sloupce:
- Real-Time
- Raw-Time

Každý ukazuje:
- Týden
- Měsíc
- Školní rok
- Celkem
- Maturita

#### Real-Time
Počítá čistě podle kalendářového času.

Příklad:
- když je polovina měsíce pryč, progress je cca 50 %

#### Raw-Time
Počítá podle školních dní.

To znamená, že:
- víkendy se nepočítají
- prázdniny se nepočítají
- ředitelská volna se mohou odpočítat

Použité helper funkce:
- `calendarPctBetween()`
- `rawPctBetween()`
- `rawDaysUntil()`
- `countSchoolDays()`
- `isSchoolDay()`

#### Důležité datumové konstanty
- `HS_START`
- `HS_END`
- `MATURITA_APPROX`
- `BREAKS`
- `DIRECTOR_DAYS`

Pokud chceš měnit školní období nebo prázdniny, upravují se právě tyto konstanty.

---

### 4.4 Daily progress
Blok `Denní progres` říká, co se děje právě teď.

Použitá funkce:
- `updateDaily(now)`

#### Denní logika
Rozlišuje:
- víkend
- před výukou
- během hodiny
- mezi hodinami
- obědovou pauzu
- po škole
- den bez výuky

#### Co ukazuje
- badge (`Právě`, `Pauza`, `Oběd`, `Volno`, ...)
- hlavní text (`Právě: MAT (u10) • Další: ELT (u15)`)
- progres aktuální hodiny
- doplňující info pod barem

#### Lunch behavior
Speciálně je natvrdo definovaná obědová pauza:
- `12:20-12:50`

Proměnné:
- `LUNCH_START`
- `LUNCH_END`

---

### 4.5 Weekly timetable
Týdenní rozvrh se renderuje do gridu pomocí funkce:
- `renderTimetable()`

#### Struktura gridu
- sloupce = hodiny 1-7
- řádky = Po-Pá
- každá buňka = lesson / event / substitution / cancellation / empty

#### Buňka může být:
- normální lesson
- `tt-event`
- `tt-subst`
- `tt-cancel`
- `tt-empty`

#### Aktuální hodina
Oranžový highlight přidává:
- `updateTimetableNowHighlight()`

Ta nebuildí celý rozvrh znovu, jen přepíná `.tt-now` na odpovídající buňce.

#### Tooltip
Každá relevantní buňka má tooltip.
Použité funkce:
- `tooltipHTML()`
- `showTooltip()`
- `moveTooltip()`
- `hideTooltip()`

Tooltip ukazuje:
- den
- hodinu
- předmět
- učebnu
- učitele
- skupinu
- typ záznamu
- poznámku
- zdroj

---

## 5. Subject shorting systém

Pro zobrazení předmětů v rozvrhu a trackeru se používá mapování:
- `SUBJECT_SHORT`

Například:
- Matematika -> MAT
- Elektrotechnika -> ELT
- Vývoj aplikací -> VYA

#### Helper funkce
- `baseShort(one)`
- `shortSubj(full, clsHint)`

`shortSubj()` řeší i splitované předměty typu:
- RUJ/NEJ
- ANJ1/ANJ2

Tím se předchází rozbitým zkratkám a duplicitám.

---

## 6. Events panel
Události jsou první stránka info panelu.

Použitá funkce:
- `renderEventsPanel()`

#### Zdroje událostí
Events panel kombinuje dva zdroje:

1. `state.classEvents`
   - velké události z backendu
2. `state.classMarks`
   - suplování / odpadnutí / event značky pro konkrétní hodiny

#### Deduplikace
Použitá funkce:
- `dedupeByKey()`

To je důležité, aby se stejné eventy nezobrazily dvakrát.

#### Vzhled událostí
Uživatel chtěl, aby eventy nepůsobily rozbitě nebo přebarveně špatně do jiných panelů.
Proto jsou event cards schválně:
- bílé / lehce theme-neutral
- suplování a odpadnutí zůstávají barevné

---

## 7. Info panel
Info panel je pravý horní panel s přepínáním 3 stránek:

- stránka 0 = Události
- stránka 1 = Sanity
- stránka 2 = Leaderboard

Použité funkce:
- `initInfoPanel()`
- `setInfoPage(pageIdx)`

#### Proč je řešený přes `display:none` a ne přes posouvací slider
Dřív docházelo k chybě, kdy byl napravo vidět kus druhé stránky. To je klasický bug špatně řešeného carousel layoutu.

Stabilní řešení je:
- všechny stránky jsou absolutně přes sebe
- aktivní má `.active`
- neaktivní jsou `display:none`

To je vizuálně mnohem stabilnější než `translateX()` slider, když je layout citlivý.

---

## 8. Sanity systém
To je nejsložitější logická část celé aplikace.

### 8.1 Co sanity dělá
Sanity systém simuluje psychické opotřebení během školy.

Základní pravidla:
- den začíná na 100 %
- sanity se snižuje podle vybrané úrovně nálady
- 1 zápis je možný jen jednou za hodinu
- nová hodina navazuje na konec minulé hodiny
- bez zapsané nálady se live graf neukazuje
- po 16:00 se live část schová a zůstane jen historie

### 8.2 Úrovně sanity
Aktuální úrovně jsou:
- Vibin
- Klasika
- Uhhh
- NAH
- Cooked

Každá má vlastní rychlost poklesu sanity:

- Vibin -> `0.04` za minutu
- Klasika -> `0.09` za minutu
- Uhhh -> `0.15` za minutu
- NAH -> `0.22` za minutu
- Cooked -> `0.30` za minutu

Definované v objektu:
- `SANITY_LEVELS`

### 8.3 Co se ukládá do localStorage
Klíč:
- `sp_sanity_log_v2`

Log ukládá dva typy záznamů:

#### Mood
```json
{
  "type": "mood",
  "day": "2026-03-04",
  "ts": 1710000000000,
  "hourIdx": 2,
  "level": 4,
  "startSanity": 77,
  "predictedEndSanity": 61
}
```

#### Kakajíčko
```json
{
  "type": "kakao",
  "day": "2026-03-04",
  "ts": 1710001234567,
  "boost": 30
}
```

### 8.4 Kdy je sanity live aktivní
Použitá funkce:
- `isLiveSanityAllowed(now)`

Live je povolené jen když:
- je školní den
- aktuálně běží hodina
- není po 16:00
- není obědová pauza

### 8.5 Zápis nálady
Použitá funkce:
- `writeSanityMood(level, now)`

Co dělá:
- zkontroluje, jestli je zápis aktuálně povolený
- zkontroluje, jestli už pro tu hodinu existuje mood
- spočítá, s jakou sanitou hodina reálně začala
- uloží mood do logu
- spočítá odhad konce hodiny
- překreslí sanity panel

### 8.6 Den vs Hodina režim
Sanity má dva režimy grafu:
- `hour`
- `day`

Přepíná se přes:
- `setSanityMode(mode)`

#### Hour mode
Ukáže jen aktuální hodinu.
Graf je viditelný až po zápisu aktuální nálady.

#### Day mode
Ukáže celý dosavadní den.
Vidíš, jak sanity klesá přes několik hodin a jak navazují jednotlivé úseky.

### 8.7 Jak se počítá průběh sanity
Použitá funkce:
- `computeSanityDayModel(now)`

Ta vytvoří:
- model všech hodin dne
- body pro vykreslení day graphu
- start / end sanity pro každou hodinu

Důležité: pokud hodina nemá mood, nepočítá se jako aktivní klesání. Klesání začne až hodinou, kde byl mood skutečně zapsán.

### 8.8 Proč graf není bez zápisu
To je schválně.

Požadované chování bylo:
- pokud nic nezaškrtneš, live graph nemá být
- graph se objeví až po mood zápisu
- ale má se dopočítat tak, kde by byl, kdyby mood platil od začátku hodiny

To řeší logika:
- start hodiny je pevný
- při zápisu v půlce hodiny se sanity dopočítá zpětně od startu té hodiny podle vybrané úrovně

### 8.9 Lock tlačítek
Použité funkce:
- `currentHourLocked(now)`
- `setFeelButtonsState(now)`

Jakmile je mood pro danou hodinu jednou zapsaný:
- všechna tlačítka se zamknou
- zvolená úroveň zůstane vizuálně aktivní
- nejde kliknout znovu

Tím je zajištěné pravidlo:
- jeden zápis za hodinu

### 8.10 Kakajíčko
Použitá funkce:
- `writeKakao(now)`

Když je sanity příliš nízko:
- ukáže se warning text
- ukáže se tlačítko pro kakajíčko

Boost se ukládá jako další událost do logu.
Výchozí boost:
- `SANITY_PILL_BOOST = 30`

### 8.11 Historie sanity
Použitá funkce:
- `renderSanityHistory()`

Zobrazuje poslední záznamy z localStorage.
Obsahuje:
- mood zápisy
- kakajíčko použití
- časy
- hodinu
- start sanity / odhad konce hodiny

Log se čistí na 14 dní přes:
- `pruneSanityLog()`

---

## 9. Leaderboard
Leaderboard je třetí stránka info panelu.

Použitá funkce:
- `loadLeaderboard()`

### Jak funguje
Načte textový soubor:
- `LeaderboardAb.txt`

Podporované formáty řádků:
- `Jméno - 12`
- `Jméno: 12`
- `Jméno,12`
- nebo i jen samotný text bez hodnoty

### Co je důležité
Pokud stránku spouštíš přes `file://`, tak browser často nedovolí fetch textového souboru korektně.

Proto README doporučuje spouštět projekt přes:
- Live Server
- localhost
- nebo `python -m http.server`

Jinak leaderboard může falešně hlásit, že soubor nejde načíst, i když ve složce fyzicky je.

---

## 10. Cáfa Tracker
Cáfa Tracker bere data z teacher API.

Použité funkce:
- `updateCafaTracker(now)`
- `formatTrackerLesson(lesson)`
- `normalizeTrackerClass(raw)`
- `normalizeTrackerRoom(raw)`
- `normalizeTrackerSubject(rawSubj, rawClass)`

### Cíl trackeru
Tracker má ukazovat jen to důležité:
- třídu
- předmět
- učebnu

Například:
- `DE3A VYT (uč10)`

Nechceš rozbitiny typu:
- `DEE - DE3A VYT (uč10) DE3A`
- nebo nějaké náhodné duplikace a šum

### Jak tracker rozhoduje stav
Tracker rozlišuje několik stavů:

#### 1. Víkend
Ukáže:
- `Cáfa se skrývá ve stínech 😎`

#### 2. Před výukou
Také `ve stínech`

#### 3. Aktivní hodina a Cáfa má lesson
Ukáže přesný lesson string:
- `DE3A VYT (uč10)`

#### 4. Je ve škole, ale zrovna není v lesson slotu
Ukáže joke stav:
- `KašpárnaSeek 👀`

Subtext doplní, co bylo naposledy nebo co ho čeká dál.

#### 5. Po škole
Jakmile už je mimo školu:
- `Cáfa se skrývá ve stínech 😎`
- subtext řekne, že je dnes už mimo školu

### Lunch behavior trackeru
Během oběda:
- tracker ukazuje obědovou pauzu
- zároveň může napsat, kde byl naposledy viděn

### Proč je tracker složitější, než vypadá
Teacher timetable není jen "co je teď", ale i:
- jestli ještě vůbec dneska učí
- jestli už odešel
- jestli je pauza mezi lessony
- jestli oběd = ještě ve škole, ale neaktivní lesson

Proto tracker používá i helper funkce:
- `getTeacherDayBounds()`
- `getLastTeacherLessonBefore()`
- `getNextTeacherLessonAfter()`

---

## 11. Theme systém
Theme systém je postavený přes CSS proměnné na `body`.

Podporované themes:
- light
- dark
- loona
- sobokill
- kasparnakart
- battlecats

### Co theme ovlivňuje
- pozadí
- card barvy
- texty
- accent barvy
- glow
- tlačítka
- badge barvy
- rozvrh texty
- background obrázky

### Přepínání theme
Použitá funkce:
- `applyTheme(theme)`

Ta:
- odstraní staré theme classes
- přidá novou `theme-*`
- uloží theme do localStorage
- překreslí sanity kvůli barvám

---

## 12. Online / offline source stav
Dashboard ukazuje, jestli data přišla z backendu nebo ne.

Použité proměnné ve state:
- `classSource`
- `teacherSource`

Možné hodnoty typicky:
- `Bakaláří`
- `Lokální`
- `loading`

Použité funkce:
- `statusText()`
- `setOnlinePills()`

To ovlivňuje:
- settings status pill
- rozvrh badge
- info panel source pill

Pokud backend spadne nebo nevrátí usable JSON, app přepne source na lokální fallback mód.

---

## 13. Loop a životní cyklus aplikace

### Boot sekvence
Při startu běží funkce:
- `boot()`

Ta dělá:
1. nastaví version text
2. inicializuje settings
3. inicializuje info panel
4. inicializuje sanity
5. načte splash text
6. nastaví loading state
7. vyrenderuje prázdný timetable + events + leaderboard
8. spustí `tick()`
9. spustí `fetchAndApply()`
10. zapne intervaly

### Tick loop
`tick()` běží každých 30 sekund.

Dělá:
- update progress bars
- update daily progress
- update tracker
- update current lesson highlight
- update sanity panel

### Backend refresh loop
`fetchAndApply()` běží každých 5 minut.

Dělá:
- sync backend dat
- reload leaderboardu

### Easter egg loop
`triggerSixSevenEmote()` běží každých 10 sekund.

---

## 14. Six Seven easter egg
Tento systém obaluje texty obsahující:
- `6/7`
- `6.7`
- `67`

Použité funkce:
- `wrapSixSeven(root)`
- `triggerSixSevenEmote()`
- `scheduleSixSevenScan()`

### Co dělá
- najde matching texty v DOM
- zabalí je do speciálního span elementu
- pravidelně je rozanimuje

Je udělaný idempotentně tak, aby nevnořoval wrapper do wrapperu znovu.

---

## 15. Co je nejkřehčí část projektu
Historicky nejvíc náchylné k rozbití jsou:

### 1. Info panel layout
Jakákoliv změna `overflow`, `transform`, `position`, `width`, `translateX`, `padding-bottom` může znovu rozbít:
- prosvítání vedlejší stránky
- ořezávání obsahu
- scroll

### 2. Sanity logika
Je to nejsložitější business logika v projektu. Když se do ní sahá bez opatrnosti, hrozí:
- dvojitý zápis moodu
- špatné navazování hodin
- nefunkční day graph
- graf i bez zápisu
- rozbití po 16:00

### 3. Tracker formatting
Pokud se bez rozmyslu změní formátování lesson stringu, vrátí se bugy typu:
- duplikované třídy
- rozbité zkratky
- špatné rozpoznání, zda je ještě ve škole

### 4. Fetch přes `file://`
To není bug kódu, ale běhového prostředí. Může rozbíjet hlavně:
- leaderboard
- splash text

---

## 16. Jak projekt spouštět správně

### Doporučené
Používej lokální server.

Například:

```bash
python -m http.server 8000
```

Pak otevři:

```text
http://localhost:8000
```

### Nedoporučené
Neotvírat přímo přes dvojklik jako:

```text
file:///C:/...
```

Protože:
- `fetch("./LeaderboardAb.txt")` může selhat
- `fetch("./MinecraftTextSource.txt")` může selhat
- browser security může blokovat lokální textové fetch requesty

---

## 17. Jak bezpečně upravovat projekt

### Doporučení 1
Měň jednu oblast po druhé.

Nejhorší možnost je dělat najednou:
- layout změny
- tracker změny
- sanity změny
- info panel změny

To je přesně cesta k regresím.

### Doporučení 2
Po každé změně otestuj minimálně:
- načtení stránky
- změnu theme
- přepnutí info panel stránek
- rozvrh hover tooltip
- daily progress
- tracker
- sanity panel
- leaderboard

### Doporučení 3
Před velkým zásahem si ulož stabilní fallback verzi.

To je extrémně důležité, protože tenhle projekt je monolit a i malá změna může rozbít 2 až 3 jiné věci.

---

## 18. Checklist po změně kódu

Po každé větší úpravě zkontroluj:

### Layout
- neprosvítá druhá stránka info panelu?
- nic nepřetéká ven?
- scroll je jen uvnitř panelů?
- sanity tlačítka se nepřekrývají s grafem?

### Rozvrh
- jde tooltip?
- zvýrazňuje se aktuální hodina?
- nejsou rozbité zkratky předmětů?

### Events
- nejsou duplicity?
- eventy vypadají bíle / theme neutral?
- suplování a odpadnutí zůstávají čitelné?

### Sanity
- bez zápisu není graf?
- po zápisu se objeví?
- další hodina navazuje na konec minulé?
- tlačítka se po zápisu zamknou?
- po 16:00 zmizí live část?
- denní a hodinový režim fungují?

### Tracker
- ukazuje jen třída + předmět + učebna?
- nevrací se bugy typu `DEE` nebo duplicity?
- umí rozeznat, jestli je ještě ve škole?
- umí přejít do `ve stínech` po škole?

### Leaderboard
- načetl se textový soubor?
- funguje parser?
- nevypadá rozbitě v theme?

---

## 19. Přehled hlavních funkcí

### Inicializace
- `boot()`
- `initSettings()`
- `initInfoPanel()`
- `initSanity()`

### Theme / title / UI
- `applyTheme()`
- `applyTitleMode()`
- `applyUiScale()`

### Backend / data
- `fetchJsonSafe()`
- `syncBackend()`
- `fetchAndApply()`

### Progress / daily / timetable
- `updateProgressBars()`
- `updateDaily()`
- `renderTimetable()`
- `updateTimetableNowHighlight()`

### Events / info panel
- `renderEventsPanel()`
- `setInfoPage()`

### Tracker
- `updateCafaTracker()`
- `formatTrackerLesson()`

### Sanity
- `setSanityMode()`
- `drawSanity()`
- `renderSanityHistory()`
- `writeSanityMood()`
- `writeKakao()`
- `computeSanityDayModel()`
- `sanityTick()`

### Leaderboard
- `loadLeaderboard()`

### Utility
- `shortSubj()`
- `escapeHtml()`
- `dedupeByKey()`
- `formatDateCZ()`
- `dayKeyFromDate()`

---

## 20. Shrnutí filozofie projektu

Tahle app není jen rozvrh. Je to stylizovaný osobní školní dashboard.

Má být:
- funkční
- přehledný
- meme, ale ne rozbitý
- vizuálně hezký
- dost chytrý na to, aby reagoval na reálný čas
- dost stabilní na to, aby šel dlouhodobě používat

Nejdůležitější pravidlo při vývoji je:

**radši menší, stabilní změna než velká "cool" úprava, která rozbije 4 staré věci.**

---

## 21. Doporučený další vývoj

Pokud se bude projekt rozšiřovat dál, dává největší smysl:

1. oddělit JavaScript do modulů
2. oddělit CSS do samostatného souboru
3. vytvořit jasné sekce pro:
   - timetable
   - sanity
   - tracker
   - events
   - leaderboard
4. přidat debug režim pro backend payloady
5. přidat versioned fallbacky stabilních buildů

To by výrazně snížilo riziko budoucích regresí.

---

## 22. Rychlý troubleshooting

### Leaderboard nejde načíst
Zkontroluj:
- existuje `LeaderboardAb.txt` ve stejné složce?
- nejede stránka přes `file://`?
- funguje fetch při spuštění přes localhost?

### Splash text nejde načíst
Zkontroluj:
- existuje `MinecraftTextSource.txt`?
- funguje server?

### Tracker ukazuje nesmysly
Zkontroluj:
- co backend vrací v teacher timetable
- jestli nejsou divné hodnoty v `class` / `room`
- jestli normalization regex nevyhazuje validní třídu

### Sanity se nechová správně
Zkontroluj:
- localStorage -> `sp_sanity_log_v2`
- zda je aktuálně školní hodina
- zda už nebyl zapsaný mood pro danou hodinu
- zda není po 16:00

### Info panel prosvítá
To znamená, že někdo znovu rozbil:
- `.panelPage`
- `.panelViewport`
- `.panelPages`
- nebo přešel zpět na posuvný slider bez pořádného ořezu

---

## 23. Stabilní fallback princip

Pro tenhle projekt je vhodné držet vždy jednu označenou verzi jako:

- `aktuální stabilní verze`

To znamená build, ke kterému se dá okamžitě vrátit, když:
- se rozbije sanity
- rozbije se info panel
- rozbije se tracker
- nebo se objeví neočekávané CSS regresní bugy

Tohle doporučuji držet disciplinovaně i do budoucna.

---

Konec README.
