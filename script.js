(() => {
  // -------------------------
  // KONFIG
  // -------------------------
  const TIMETABLE_URL = "https://1kspa-kladno.bakalari.cz/Timetable/Public/Permanent/Class/5A";
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";

  const API_URL = "https://bakalariapijanpilat-bp.workers.dev.workers.dev/api/timetable?class=5A&type=Actual";
  
  // 4 roky dohromady (jak jsi psal)
  const HS_START = localDate(2023, 9, 4);
  const HS_END   = localDateEnd(2027, 6, 30);

  // Maturita "obvykle" — jen měsíc: květen 2027 (orientačně 1. 5.)
  const MATURITA_APPROX = localDateEnd(2027, 5, 1);

  // Ředitelské volno se nedá automaticky vyčíst – sem si případně doplníš:
  const DIRECTOR_DAYS = [
    // "2026-11-20",
  ];

  // Podzimní / vánoční / pololetní (MŠMT) + jarní prázdniny (okres Kladno)
  // (RAW počítá: bez víkendů a bez těchto dní)
  const BREAKS = [
    // 2023/24 (MŠMT)
    range("2023-10-26", "2023-10-27"),
    range("2023-12-23", "2024-01-02"),
    range("2024-02-02", "2024-02-02"),
    // jarní Kladno 2023/24
    range("2024-02-26", "2024-03-03"),

    // 2024/25 (MŠMT)
    range("2024-10-29", "2024-10-30"),
    range("2024-12-23", "2025-01-03"),
    range("2025-01-31", "2025-01-31"),
    // jarní Kladno 2024/25
    range("2025-03-03", "2025-03-09"),

    // 2025/26 (MŠMT)
    range("2025-10-27", "2025-10-29"), // (MŠMT uvádí Po a St, v praxi to vychází jako blok okolo svátku)
    range("2025-12-22", "2026-01-02"),
    range("2026-01-30", "2026-01-30"),
    // jarní Kladno 2025/26
    range("2026-03-09", "2026-03-15"),

    // 2026/27 (MŠMT)
    range("2026-10-29", "2026-10-30"),
    range("2026-12-23", "2027-01-03"),
    range("2027-01-29", "2027-01-29"),
    // jarní Kladno 2026/27
    range("2027-02-01", "2027-02-07"),
  ];

  // (volitelné) státní svátky, které často spadnou do školních dnů
  // — RAW je pak ještě realističtější
  const NATIONAL_HOLIDAYS = [
    "2023-09-28","2023-10-28","2023-11-17",
    "2024-01-01","2024-05-01","2024-05-08","2024-09-28","2024-10-28","2024-11-17",
    "2025-01-01","2025-05-01","2025-05-08","2025-09-28","2025-10-28","2025-11-17",
    "2026-01-01","2026-05-01","2026-05-08","2026-09-28","2026-10-28","2026-11-17",
    "2027-01-01","2027-05-01","2027-05-08"
  ];

  // Předmětové zkratky → hezké názvy (doplňuj podle potřeby)
  const SUBJECT_MAP = {
    "MAT":"Matematika",
    "ČJL":"Český jazyk",
    "ANJ":"Angličtina",
    "ANJ1":"Angličtina",
    "ANJ2":"Angličtina",
    "NEJ":"Německý jazyk",
    "RUJ":"Ruský jazyk",
    "DEJ":"Dějepis",
    "FYZ":"Fyzika",
    "EKO":"Ekonomika",
    "OBN":"Občanská nauka",
    "VYT":"Výtvarná výchova",
    "TVY":"Tělesná výchova",
    "PRH":"Praxe / předmět (PRH)",
    "ELT":"Elektro / (ELT)",
    "SWA":"Software / (SWA)",
    "PSK":"Psychologie / (PSK)",
    "ZPG":"ZPG",
    "VYA":"Vyučování / (VYA)"
  };

  // -------------------------
  // STATE
  // -------------------------
  let timetable = null; // { times:[{startMin,endMin}], days:{Mon:[subj...],...} }
  let lastTimetableStatus = "Načítám rozvrh…";

  // -------------------------
  // UI Helpers
  // -------------------------
  const el = (id) => document.getElementById(id);
  const safeText = (id, txt) => { const n=el(id); if(n) n.textContent = txt; };
  const setWidth = (id, pct) => {
    const n = el(id);
    if (!n) return;
    const x = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
    n.style.width = x.toFixed(2) + "%";
  };

  function showDebug(msg){
    const d = el("debugHint");
    if (d) d.textContent = msg;
  }

  // -------------------------
  // Dates
  // -------------------------
  function localDate(y,m,d){
    const dt = new Date(y, m-1, d);
    dt.setHours(0,0,0,0);
    return dt;
  }
  function localDateEnd(y,m,d){
    const dt = new Date(y, m-1, d);
    dt.setHours(23,59,59,999);
    return dt;
  }
  function toISO(d){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const da=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function range(startISO,endISO){ return { startISO, endISO }; }
  function inRangeISO(dateISO, r){
    return dateISO >= r.startISO && dateISO <= r.endISO;
  }

  // -------------------------
  // School-year ranges (MŠMT)
  // -------------------------
  function getSchoolYearRange(now){
    const Y = [
      { start: localDate(2023,9,4), end: localDateEnd(2024,6,30) },
      { start: localDate(2024,9,2), end: localDateEnd(2025,6,30) },
      { start: localDate(2025,9,1), end: localDateEnd(2026,6,30) },
      { start: localDate(2026,9,1), end: localDateEnd(2027,6,30) },
    ];
    for (const r of Y) if (now >= r.start && now <= r.end) return r;
    // v létě vezmi nejbližší budoucí
    const fut = Y.find(r => now < r.start);
    return fut || Y[Y.length-1];
  }

  // -------------------------
  // RAW: školní den?
  // -------------------------
  function isSchoolDay(date){
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;

    const iso = toISO(date);
    if (DIRECTOR_DAYS.includes(iso)) return false;
    if (NATIONAL_HOLIDAYS.includes(iso)) return false;

    for (const b of BREAKS){
      if (inRangeISO(iso, b)) return false;
    }
    return true;
  }

  function countSchoolDays(start, end){
    const s = new Date(start.getTime()); s.setHours(0,0,0,0);
    const e = new Date(end.getTime());   e.setHours(23,59,59,999);

    let c = 0;
    const cur = new Date(s.getTime());
    while (cur <= e){
      if (isSchoolDay(cur)) c++;
      cur.setDate(cur.getDate()+1);
    }
    return c;
  }

  function rawProgressBetween(start, end, now){
    const total = countSchoolDays(start, end);
    const clippedNow = now < start ? start : (now > end ? end : now);
    const passed = countSchoolDays(start, clippedNow);
    const pct = total > 0 ? (passed/total)*100 : 0;
    return { pct, total, passed };
  }

  function calendarProgressBetween(start, end, now){
    const total = end - start;
    if (total <= 0) return 0;
    const passed = Math.min(Math.max(now - start, 0), total);
    return (passed/total)*100;
  }

  // -------------------------
  // Timetable fetch + parse (odolné)
  // -------------------------
  async function loadTimetable(){
    try {
      lastTimetableStatus = "Načítám rozvrh…";
      setDailyLoading();

      const url = CORS_PROXY + encodeURIComponent(TIMETABLE_URL);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const html = await res.text();
      timetable = parseBakalariText(html);
      lastTimetableStatus = "Rozvrh načten ✔";
    } catch (e){
      timetable = null;
      lastTimetableStatus = "Rozvrh se nepodařilo načíst (CORS/proxy).";
      setDailyError(lastTimetableStatus);
    } finally {
      showDebug(lastTimetableStatus);
    }
  }

  function stripTags(html){
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseBakalariText(html){
    const text = stripTags(html);

    // 1) časy hodin: "7:55 - 8:40"
    const timeRe = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
    const times = [];
    let m;
    while ((m = timeRe.exec(text)) !== null){
      const sMin = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const eMin = parseInt(m[3],10)*60 + parseInt(m[4],10);
      if (!times.some(t => t.startMin === sMin && t.endMin === eMin)){
        times.push({ startMin: sMin, endMin: eMin });
      }
    }
    times.sort((a,b)=>a.startMin-b.startMin);
    if (times.length === 0) throw new Error("Nenalezeny časy hodin.");

    // 2) dny: Bakaláři mají sekce "Mon ... Tue ... Wed ... Thu ... Fri"
    const days = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };

    function between(a,b){
      const i = text.indexOf(a);
      if (i < 0) return "";
      const j = b ? text.indexOf(b, i + a.length) : -1;
      return j >= 0 ? text.slice(i, j) : text.slice(i);
    }

    const segMon = between("Mon", "Tue");
    const segTue = between("Tue", "Wed");
    const segWed = between("Wed", "Thu");
    const segThu = between("Thu", "Fri");
    const segFri = between("Fri", null);

    // Ve tvé stránce je struktura opakovaně: (místnost) (PŘEDMĚT) (UČITEL)
    // Chceme vyzobat PŘEDMĚT v pořadí hodin, takže vezmeme tokeny typu MAT, ČJL, ANJ1...
    const subjRe = /\b([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,6}\d?)\b/g;

    function pickSubjects(seg){
      const out = [];
      let mm;
      while ((mm = subjRe.exec(seg)) !== null){
        const tok = mm[1];

        // odfiltruj "Mon Tue..." apod.
        if (["MON","TUE","WED","THU","FRI"].includes(tok)) continue;

        // odfiltruj učebny "UČ10", "VT1", "TV3" (obvykle místnosti)
        if (tok.startsWith("UČ") || tok.startsWith("VT") || tok.startsWith("TV")) continue;

        out.push(tok);
      }

      // Heuristika: v textu se občas objeví učitelé jako 3 písmena (RYB, KLE...)
      // => vezmeme každou 2. položku? Ne, radši vezmeme jen tokeny, které vypadají jako předměty:
      const filtered = out.filter(t => t.length >= 2 && t.length <= 5 && !/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3}$/.test(t));
      // Kdyby filtr vyhodil moc, fallback na původní
      const finalList = filtered.length >= 3 ? filtered : out;

      return finalList.slice(0, times.length);
    }

    days.Mon = pickSubjects(segMon);
    days.Tue = pickSubjects(segTue);
    days.Wed = pickSubjects(segWed);
    days.Thu = pickSubjects(segThu);
    days.Fri = pickSubjects(segFri);

    return { times, days };
  }

  // -------------------------
  // Denní progres (právě + další)
  // -------------------------
  function niceSubject(code){
    return SUBJECT_MAP[code] || code;
  }

  function minutesToHHMM(min){
    const h = String(Math.floor(min/60)).padStart(2,"0");
    const m = String(min%60).padStart(2,"0");
    return `${h}:${m}`;
  }

  function setDailyLoading(){
    const b = el("dailyStatusBadge");
    if (b){ b.className = "badge"; b.textContent = "Rozvrh…"; }
    safeText("dailyText", "Načítám rozvrh…");
    setWidth("day-progress", 0);
    safeText("day-label", "");
  }

  function setDailyError(msg){
    const b = el("dailyStatusBadge");
    if (b){ b.className = "badge err"; b.textContent = "Chyba"; }
    safeText("dailyText", msg);
    setWidth("day-progress", 0);
    safeText("day-label", "");
  }

  function setFree(){
    const b = el("dailyStatusBadge");
    if (b){ b.className = "badge free"; b.textContent = "Volno"; }
    safeText("dailyText", "Volno 😎");
    setWidth("day-progress", 100);
    safeText("day-label", "");
  }

  function updateDaily(now){
    // víkend => volno
    const dow = now.getDay();
    if (dow === 0 || dow === 6){ setFree(); return; }

    if (!timetable){
      setDailyError(lastTimetableStatus || "Rozvrh není dostupný.");
      return;
    }

    const key = (dow===1)?"Mon":(dow===2)?"Tue":(dow===3)?"Wed":(dow===4)?"Thu":"Fri";
    const times = timetable.times;
    const subjects = timetable.days[key] || [];

    const nowMin = now.getHours()*60 + now.getMinutes();

    const first = times[0];
    const last  = times[times.length-1];

    if (nowMin < first.startMin){
      const b = el("dailyStatusBadge");
      if (b){ b.className="badge live"; b.textContent="Dnes"; }
      const s0 = niceSubject(subjects[0] || "Hodina 1");
      safeText("dailyText", `Za chvíli začne: ${s0}`);
      setWidth("day-progress", 0);
      safeText("day-label", `Start v ${minutesToHHMM(first.startMin)}`);
      return;
    }

    if (nowMin > last.endMin){
      setFree();
      return;
    }

    // probíhající hodina / pauza
    for (let i=0; i<times.length; i++){
      const t = times[i];
      const subj = niceSubject(subjects[i] || `Hodina ${i+1}`);

      // hodina právě běží
      if (nowMin >= t.startMin && nowMin <= t.endMin){
        const pct = ((nowMin - t.startMin) / Math.max(1, (t.endMin - t.startMin))) * 100;
        const next = subjects[i+1] ? niceSubject(subjects[i+1]) : null;

        const b = el("dailyStatusBadge");
        if (b){ b.className="badge live"; b.textContent="Právě"; }

        safeText("dailyText", next
          ? `Právě: ${subj} • Další: ${next}`
          : `Právě: ${subj}`
        );

        setWidth("day-progress", pct);
        safeText("day-label", `Hodina ${i+1} • ${minutesToHHMM(t.startMin)}–${minutesToHHMM(t.endMin)} • ${pct.toFixed(0)}%`);
        return;
      }

      // pauza mezi hodinami
      const nextT = times[i+1];
      if (nextT && nowMin > t.endMin && nowMin < nextT.startMin){
        const nextSubj = niceSubject(subjects[i+1] || `Hodina ${i+2}`);
        const b = el("dailyStatusBadge");
        if (b){ b.className="badge live"; b.textContent="Pauza"; }
        safeText("dailyText", `Následuje: ${nextSubj}`);
        setWidth("day-progress", 0);
        safeText("day-label", `Další hodina v ${minutesToHHMM(nextT.startMin)}`);
        return;
      }
    }

    setFree();
  }

  // -------------------------
  // Update všech barů
  // -------------------------
  function updateAll(){
    const now = new Date();

    // TÝDEN (Po–Pá, víkend = orange + Weekend 😎)
    const dow = now.getDay(); // Ne=0
    const isWeekend = (dow === 0 || dow === 6);
    const timeInDay = now.getHours()/24 + now.getMinutes()/1440;

    const workdayIndex = (dow===1)?0:(dow===2)?1:(dow===3)?2:(dow===4)?3:(dow===5)?4:4;
    const weekPct = isWeekend ? 100 : ((workdayIndex + timeInDay)/5)*100;

    setWidth("week-progress", weekPct);
    setWidth("week-raw", weekPct);

    const weekFill = el("week-progress");
    if (weekFill){
      if (isWeekend) weekFill.classList.add("weekend");
      else weekFill.classList.remove("weekend");
    }
    safeText("week-label", isWeekend ? "Weekend 😎" : `Týden: ${weekPct.toFixed(1)}%`);
    safeText("week-raw-label", `RAW: ${weekPct.toFixed(1)}%`);

    // MĚSÍC kalendářně
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const monthPct = ((now.getDate()-1 + timeInDay)/daysInMonth)*100;
    setWidth("month-progress", monthPct);
    safeText("month-label", `Kalendář: ${monthPct.toFixed(1)}%`);

    // MĚSÍC RAW
    const mStart = localDate(now.getFullYear(), now.getMonth()+1, 1);
    const mEnd = localDateEnd(now.getFullYear(), now.getMonth()+1, daysInMonth);
    const mRaw = rawProgressBetween(mStart, mEnd, now);
    setWidth("month-raw", mRaw.pct);
    safeText("month-raw-label", `RAW: ${mRaw.pct.toFixed(1)}%`);

    // ŠKOLNÍ ROK
    const yr = getSchoolYearRange(now);
    const yearPct = calendarProgressBetween(yr.start, yr.end, now);
    setWidth("year-progress", yearPct);
    safeText("year-label", `Kalendář: ${yearPct.toFixed(1)}%`);

    const yRaw = rawProgressBetween(yr.start, yr.end, now);
    setWidth("year-raw", yRaw.pct);
    safeText("year-raw-label", `RAW: ${yRaw.pct.toFixed(1)}%`);

    // CELKEM (4 roky)
    const totalPct = calendarProgressBetween(HS_START, HS_END, now);
    setWidth("total-progress", totalPct);
    safeText("total-label", `Kalendář: ${totalPct.toFixed(1)}%`);

    const tRaw = rawProgressBetween(HS_START, HS_END, now);
    setWidth("total-raw", tRaw.pct);
    safeText("total-raw-label", `RAW: ${tRaw.pct.toFixed(1)}%`);

    // MATURITA
    const daysUntil = Math.ceil((MATURITA_APPROX - now) / (1000*60*60*24));
    safeText("maturita-label", (daysUntil >= 0)
      ? `Zbývá ~${daysUntil} dní do maturity (orientačně květen 2027).`
      : `Maturita už je za tebou (${Math.abs(daysUntil)} dní zpět).`
    );

    // Denní progres
    const toggleDaily = el("toggleDaily");
    if (!toggleDaily || toggleDaily.checked) updateDaily(now);
  }

  // -------------------------
  // Nastavení UI
  // -------------------------
  function initSettings(){
    const settingsBtn = el("settingsBtn");
    const settingsPanel = el("settingsPanel");
    const toggleTimetable = el("toggleTimetable");
    const toggleDaily = el("toggleDaily");
    const timetableBlock = el("timetableBlock");
    const dailyBlock = el("dailyBlock");

    if (settingsBtn && settingsPanel){
      settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
    }

    if (toggleTimetable && timetableBlock){
      toggleTimetable.addEventListener("change", () => {
        timetableBlock.classList.toggle("hidden", !toggleTimetable.checked);
      });
    }

    if (toggleDaily && dailyBlock){
      toggleDaily.addEventListener("change", () => {
        dailyBlock.classList.toggle("hidden", !toggleDaily.checked);
      });
    }
  }

  // -------------------------
  // BOOT
  // -------------------------
  function boot(){
    initSettings();

    // Pokud ti to někdy “nic neukazuje”, tady je diagnostika:
    showDebug("Start…");

    // 1) hned zobraz bary
    try { updateAll(); } catch (e) { showDebug("JS chyba při updateAll: " + e.message); }

    // 2) načti rozvrh (asynchronně), pak update znovu
    loadTimetable().finally(() => {
      try { updateAll(); } catch (e) { showDebug("JS chyba po načtení rozvrhu: " + e.message); }
    });

    // 3) auto refresh
    setInterval(() => {
      try { updateAll(); } catch (e) { showDebug("JS chyba v interval: " + e.message); }
    }, 30_000);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
