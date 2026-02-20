document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // KONFIG
  // =========================
  const TIMEZONE_NOTE = "Europe/Prague"; // prohlížeč už většinou má správně
  const TIMETABLE_URL = "https://1kspa-kladno.bakalari.cz/Timetable/Public/Permanent/Class/5A";
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";

  // Start SŠ: první pondělí v září 2023 = 4.9.2023 (sedí i s MŠMT 2023/24)
  const HS_START = localDate(2023, 9, 4);
  // Konec školy (školní vyučování) – typicky konec června 2027
  const HS_END = localDateEnd(2027, 6, 30);

  // Maturita: chtěl jsi "obvykle" a stačí měsíc → dáme orientačně 1. květen 2027
  // (maturitní období se rok od roku liší; přesné datum DT určuje CERMAT v kalendáři)
  const MATURITA_APPROX = localDateEnd(2027, 5, 1);

  // Ředitelské volno – NEJDE spolehlivě zjistit automaticky:
  // sem si případně doplň konkrétní dny ve formátu YYYY-MM-DD
  const DIRECTOR_DAYS = [
    // "2026-11-20",
  ];

  // Volna/prázdniny (pro okres Kladno + celostátní dny) – pro roky, které tě zajímají:
  // Pozn.: velikonoční prázdniny se liší podle roku; tady je typicky "Zelený čtvrtek".
  // Pokud chceš 110% přesnost pro 2026/27, doplním po termínu.
  const HOLIDAYS = [
    // 2023/24 (MŠMT)
    { start: "2023-10-26", end: "2023-10-27" }, // podzimní
    { start: "2023-12-23", end: "2024-01-02" }, // vánoční
    { start: "2024-02-02", end: "2024-02-02" }, // pololetní
    { start: "2024-02-26", end: "2024-03-03" }, // jarní Kladno (2023/24)

    // 2024/25 (MŠMT + okres Kladno)
    { start: "2024-10-29", end: "2024-10-30" }, // podzimní (MŠMT 24/25: úterý+středa)
    { start: "2024-12-23", end: "2025-01-03" }, // vánoční
    { start: "2025-01-31", end: "2025-01-31" }, // pololetní
    { start: "2025-03-03", end: "2025-03-09" }, // jarní Kladno (2024/25)

    // 2025/26 (MŠMT + okres Kladno)
    { start: "2025-10-27", end: "2025-10-29" }, // podzimní (MŠMT 25/26: Po+St; úterý se běžně neuvádí, ale často bývá "mezera" – nechávám Po–St)
    { start: "2025-12-22", end: "2026-01-02" }, // vánoční
    { start: "2026-01-30", end: "2026-01-30" }, // pololetní (u MŠMT 25/26 je 30.1.2026)
    { start: "2026-03-09", end: "2026-03-15" }, // jarní Kladno (2025/26)

    // 2026/27 (MŠMT + okres Kladno)
    { start: "2026-10-29", end: "2026-10-30" }, // podzimní (často čt+pá)
    { start: "2026-12-23", end: "2027-01-03" }, // vánoční
    { start: "2027-01-29", end: "2027-01-29" }, // pololetní
    { start: "2027-02-01", end: "2027-02-07" }, // jarní Kladno (2026/27)
  ].map(r => ({ start: r.start, end: r.end }));

  // =========================
  // UI: Nastavení
  // =========================
  const settingsBtn = el("settingsBtn");
  const settingsPanel = el("settingsPanel");
  const toggleTimetable = el("toggleTimetable");
  const toggleDaily = el("toggleDaily");
  const timetableBlock = el("timetableBlock");
  const dailyBlock = el("dailyBlock");

  settingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });

  toggleTimetable.addEventListener("change", () => {
    timetableBlock.classList.toggle("hidden", !toggleTimetable.checked);
  });

  toggleDaily.addEventListener("change", () => {
    dailyBlock.classList.toggle("hidden", !toggleDaily.checked);
  });

  // =========================
  // Rozvrh: parsování z HTML
  // =========================
  let timetable = null; // { times: [{idx,startMin,endMin}], days: {Mon:[...], Tue:[...], ...} }

  async function loadTimetable() {
    try {
      const res = await fetch(CORS_PROXY + encodeURIComponent(TIMETABLE_URL), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();

      const doc = new DOMParser().parseFromString(html, "text/html");
      timetable = parseBakalariTimetableFromDoc(doc);

      // po načtení hned přepočítat denní progres
      updateAll();
    } catch (e) {
      timetable = null;
      setDailyError("Nepovedlo se načíst rozvrh.");
    }
  }

  // Z toho, co je na stránce vidět (textově): časy hodin + bloky Mon/Tue/...
  function parseBakalariTimetableFromDoc(doc) {
    const text = doc.body ? doc.body.innerText : "";
    if (!text || text.length < 100) throw new Error("Empty timetable");

    // 1) časy hodin: najdeme řádky jako "7:55 - 8:40"
    const timeRe = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
    const times = [];
    let m;
    while ((m = timeRe.exec(text)) !== null) {
      const sMin = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const eMin = parseInt(m[3],10)*60 + parseInt(m[4],10);
      // oříznout duplicity
      if (!times.some(t => t.startMin === sMin && t.endMin === eMin)) {
        times.push({ startMin: sMin, endMin: eMin });
      }
    }

    // seřadit
    times.sort((a,b)=>a.startMin-b.startMin);

    // 2) dny: rozsekáme podle "Mon Tue Wed Thu Fri"
    const days = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };
    const dayKeys = ["Mon","Tue","Wed","Thu","Fri"];

    // hack: vezmeme text a rozdělíme na segmenty od "Mon" do "Tue" atd.
    function segmentBetween(startKey, endKey) {
      const i = text.indexOf(startKey);
      if (i < 0) return "";
      const j = endKey ? text.indexOf(endKey, i + startKey.length) : -1;
      return j >= 0 ? text.slice(i, j) : text.slice(i);
    }

    const segments = {
      Mon: segmentBetween("Mon", "Tue"),
      Tue: segmentBetween("Tue", "Wed"),
      Wed: segmentBetween("Wed", "Thu"),
      Thu: segmentBetween("Thu", "Fri"),
      Fri: segmentBetween("Fri", null),
    };

    // V segmentech jsou předměty jako zkratky (MAT, ANJ1, ČJL...) + učebna + učitel.
    // Pro denní progres nám stačí jen předmět v pořadí hodin.
    for (const k of dayKeys) {
      const seg = segments[k] || "";
      // vytáhneme "předměty" jako tokeny z velkých písmen / číslic / diakritiky
      // Na Bakalářích to často bývá 3-4 znaky + číslo (ANJ1)
      const subj = [];
      const tokenRe = /\b([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,6}\d?)\b/g;
      let t;
      while ((t = tokenRe.exec(seg)) !== null) {
        const tok = t[1];

        // odfiltruj zjevné dny, čísla hodin, apod.
        if (["MON","TUE","WED","THU","FRI"].includes(tok)) continue;

        // hrubý filtr: předměty bývají kratší, učitelé jsou 3 písmena (RYB, KLE...) – ale i to chceme ignorovat.
        // V praxi: bereme jen první token v "trojici" předmět/u učebna/u učitel.
        // Takže to vezmeme tak, že po tokenu předmětu často následuje "učXX" nebo "TVX", takže si vezmeme token, který není "uč" ani "TV".
        if (tok.startsWith("UČ") || tok.startsWith("TV")) continue;

        subj.push(tok);
      }

      // Heuristika: v segmentech se opakují učitelé i učebny → vybereme jen tolik položek, kolik máme časů hodin.
      days[k] = subj.slice(0, times.length);
    }

    return { times, days };
  }

  // =========================
  // Progress výpočty
  // =========================

  function updateAll() {
    const now = new Date();

    // ----- TÝDEN: Po–Pá + víkend (oranžová + Weekend 😎)
    const dayJs = now.getDay(); // Ne=0, Po=1..Pá=5, So=6
    const isWeekend = (dayJs === 0 || dayJs === 6);
    const timeInDay = now.getHours()/24 + now.getMinutes()/1440;

    const workdayIndex =
      dayJs === 1 ? 0 :
      dayJs === 2 ? 1 :
      dayJs === 3 ? 2 :
      dayJs === 4 ? 3 :
      dayJs === 5 ? 4 : 4;

    const weekProgress = isWeekend ? 100 : ((workdayIndex + timeInDay) / 5) * 100;
    setBar("week-progress", weekProgress);

    // týden RAW = stejné, protože už je Po–Pá
    setBar("week-raw", weekProgress);

    const weekFill = el("week-progress");
    const weekLabel = el("week-label");
    const weekRawLabel = el("week-raw-label");

    if (isWeekend) {
      weekFill.classList.add("weekend");
      weekLabel.textContent = "Weekend 😎";
    } else {
      weekFill.classList.remove("weekend");
      weekLabel.textContent = `Týden: ${weekProgress.toFixed(1)}%`;
    }
    weekRawLabel.textContent = `RAW: ${weekProgress.toFixed(1)}%`;

    // ----- MĚSÍC: kalendářně
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthProgress = ((now.getDate() - 1 + timeInDay) / daysInMonth) * 100;
    setBar("month-progress", monthProgress);
    el("month-label").textContent = `Kalendář: ${monthProgress.toFixed(1)}%`;

    // ----- MĚSÍC RAW: jen školní dny v aktuálním měsíci (bez víkendů a prázdnin)
    const monthStart = localDate(now.getFullYear(), now.getMonth()+1, 1);
    const monthEnd = localDateEnd(now.getFullYear(), now.getMonth()+1, daysInMonth);
    const monthRaw = rawProgressBetween(monthStart, monthEnd, now);
    setBar("month-raw", monthRaw.pct);
    el("month-raw-label").textContent = `RAW: ${monthRaw.pct.toFixed(1)}%`;

    // ----- ŠKOLNÍ ROK: najdi rozsah dle MŠMT (pro roky, co nás zajímají)
    const schoolRange = getSchoolYearRange(now);
    const yearProgress = progressBetween(schoolRange.start, schoolRange.end, now);
    setBar("year-progress", yearProgress);
    el("year-label").textContent = `Kalendář: ${yearProgress.toFixed(1)}%`;

    // ----- ŠKOLNÍ ROK RAW: jen školní dny v daném školním roce
    const yearRaw = rawProgressBetween(schoolRange.start, schoolRange.end, now);
    setBar("year-raw", yearRaw.pct);
    el("year-raw-label").textContent = `RAW: ${yearRaw.pct.toFixed(1)}%`;

    // ----- CELKEM: kalendářně (4 roky)
    const totalProgress = progressBetween(HS_START, HS_END, now);
    setBar("total-progress", totalProgress);
    el("total-label").textContent = `Kalendář: ${totalProgress.toFixed(1)}%`;

    // ----- CELKEM RAW: jen školní dny (bez víkendů/prázdnin + případné ředitelské dny)
    const totalRaw = rawProgressBetween(HS_START, HS_END, now);
    setBar("total-raw", totalRaw.pct);
    el("total-raw-label").textContent = `RAW: ${totalRaw.pct.toFixed(1)}%`;

    // ----- MATURITA: jen orientačně měsíc (květen 2027)
    const daysUntil = Math.ceil((MATURITA_APPROX - now) / (1000*60*60*24));
    el("maturita-label").textContent = (daysUntil >= 0)
      ? `Zbývá ~${daysUntil} dní do maturity (orientačně květen 2027).`
      : `Maturita už je za tebou (${Math.abs(daysUntil)} dní zpět).`;

    // ----- DENNÍ PROGRES podle rozvrhu (pokud máme timetable a je pracovní den)
    if (toggleDaily.checked) {
      updateDaily(now);
    }
  }

  function updateDaily(now) {
    const badge = el("dailyStatusBadge");
    const textEl = el("dailyText");
    const bar = el("day-progress");
    const label = el("day-label");

    // víkend => Volno 😎
    const day = now.getDay();
    if (day === 0 || day === 6) {
      setFree(badge, textEl, bar, label);
      return;
    }

    if (!timetable || !timetable.times || timetable.times.length === 0) {
      badge.className = "badge err";
      badge.textContent = "Rozvrh";
      textEl.textContent = "Rozvrh se nepodařilo načíst.";
      bar.style.width = "0%";
      label.textContent = "";
      return;
    }

    const dayKey = day === 1 ? "Mon" : day === 2 ? "Tue" : day === 3 ? "Wed" : day === 4 ? "Thu" : "Fri";
    const todaySubjects = timetable.days[dayKey] || [];
    const times = timetable.times;

    const nowMin = now.getHours()*60 + now.getMinutes();

    // najdi první hodinu dne (pro případ rána)
    const first = times[0];
    const last = times[times.length-1];

    // mimo interval dne => Volno 😎 (po škole)
    if (nowMin > last.endMin) {
      setFree(badge, textEl, bar, label);
      return;
    }

    // před začátkem první hodiny
    if (nowMin < first.startMin) {
      badge.className = "badge live";
      badge.textContent = "Dnes";
      const subj = todaySubjects[0] || "Hodina 1";
      textEl.textContent = `Za chvíli začne: ${subj}`;
      bar.style.width = "0%";
      label.textContent = "";
      return;
    }

    // zjisti aktuální hodinu nebo přestávku
    for (let i=0; i<times.length; i++) {
      const t = times[i];
      const subj = todaySubjects[i] || `Hodina ${i+1}`;

      if (nowMin >= t.startMin && nowMin <= t.endMin) {
        const pct = ((nowMin - t.startMin) / Math.max(1, (t.endMin - t.startMin))) * 100;
        badge.className = "badge live";
        badge.textContent = "Právě";
        textEl.textContent = `Právě probíhá: ${subj}`;
        bar.style.width = `${clampPct(pct)}%`;
        label.textContent = `Hodina ${i+1} • ${minutesToHHMM(t.startMin)}–${minutesToHHMM(t.endMin)} • ${pct.toFixed(0)}%`;
        return;
      }

      // přestávka mezi hodinami: ukaž následující hodinu
      const next = times[i+1];
      if (next && nowMin > t.endMin && nowMin < next.startMin) {
        badge.className = "badge live";
        badge.textContent = "Pauza";
        const nextSubj = todaySubjects[i+1] || `Hodina ${i+2}`;
        textEl.textContent = `Následuje: ${nextSubj}`;
        bar.style.width = "0%";
        label.textContent = `Přestávka • další hodina ${i+2} v ${minutesToHHMM(next.startMin)}`;
        return;
      }
    }

    // fallback
    setFree(badge, textEl, bar, label);
  }

  function setFree(badge, textEl, bar, label) {
    badge.className = "badge free";
    badge.textContent = "Volno";
    textEl.textContent = "Volno 😎";
    bar.style.width = "100%";
    label.textContent = "";
  }

  function setDailyError(msg) {
    const badge = el("dailyStatusBadge");
    const textEl = el("dailyText");
    const bar = el("day-progress");
    const label = el("day-label");
    badge.className = "badge err";
    badge.textContent = "Chyba";
    textEl.textContent = msg;
    bar.style.width = "0%";
    label.textContent = "";
  }

  // =========================
  // School year ranges (MŠMT)
  // =========================
  function getSchoolYearRange(now) {
    // pro jednoduchost držíme relevantní roky:
    const YEARS = [
      { start: localDate(2023,9,4), end: localDateEnd(2024,6,30) },
      { start: localDate(2024,9,2), end: localDateEnd(2025,6,30) },
      { start: localDate(2025,9,1), end: localDateEnd(2026,6,30) },
      { start: localDate(2026,9,1), end: localDateEnd(2027,6,30) },
    ];

    for (const r of YEARS) {
      if (now >= r.start && now <= r.end) return r;
    }

    // když jsi v létě, ukaž "příští školní rok"
    // najdi nejbližší start v budoucnu, jinak poslední
    const future = YEARS.find(r => now < r.start);
    return future || YEARS[YEARS.length-1];
  }

  // =========================
  // RAW progress (bez víkendů + bez prázdnin + bez ředitelských dnů)
  // =========================
  function rawProgressBetween(start, end, now) {
    const effectiveNow = now < start ? start : (now > end ? end : now);

    const total = countSchoolDays(start, end);
    const passed = countSchoolDays(start, effectiveNow);

    const pct = total > 0 ? (passed / total) * 100 : 0;
    return { pct, totalDays: total, passedDays: passed };
  }

  function countSchoolDays(start, end) {
    const s = new Date(start.getTime());
    s.setHours(0,0,0,0);
    const e = new Date(end.getTime());
    e.setHours(23,59,59,999);

    let count = 0;
    const cur = new Date(s.getTime());

    while (cur <= e) {
      if (isSchoolDay(cur)) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  function isSchoolDay(d) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false; // víkend

    const iso = toISODate(d);
    if (DIRECTOR_DAYS.includes(iso)) return false;

    // prázdniny/volna
    for (const r of HOLIDAYS) {
      const rs = parseISOStart(r.start);
      const re = parseISOEnd(r.end);
      if (d >= rs && d <= re) return false;
    }
    return true;
  }

  // =========================
  // Helpers
  // =========================
  function el(id){ return document.getElementById(id); }

  function setBar(id, pct) {
    const x = Math.max(0, Math.min(100, pct));
    el(id).style.width = x + "%";
  }

  function progressBetween(start, end, now) {
    const total = end - start;
    if (total <= 0) return 0;
    const passed = Math.min(Math.max(now - start, 0), total);
    return (passed / total) * 100;
  }

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

  function toISODate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }

  function parseISOStart(iso){
    const [y,m,d] = iso.split("-").map(Number);
    return localDate(y,m,d);
  }
  function parseISOEnd(iso){
    const [y,m,d] = iso.split("-").map(Number);
    return localDateEnd(y,m,d);
  }

  function minutesToHHMM(min){
    const h = String(Math.floor(min/60)).padStart(2,"0");
    const m = String(min%60).padStart(2,"0");
    return `${h}:${m}`;
  }

  function clampPct(p){ return Math.max(0, Math.min(100, p)); }

  // =========================
  // Start
  // =========================
  loadTimetable();
  updateAll();
  setInterval(updateAll, 30_000); // refresh každých 30s
});
