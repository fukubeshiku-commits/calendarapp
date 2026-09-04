let daysGrid;
let addbulkbutton;
let addplanscreen;
let appcontainer;
let daysGridbulk;
let customlocationplace;
let nextbutton;
let backbutton;
let thisMonth;
let nextmonth;
let prevmonth;
let thisMonthBulk;
let nextmonthbulk;
let prevmonthbulk;
let exportIcsButton;

const current = {
    year: new Date().getFullYear(),
    monthIndex: new Date().getMonth()
};

const selectedDates = new Set();
let saved = [];

async function loadSaved() {
    try {
        const res = await fetch('/api/schedule');
        if (!res.ok) throw new Error('fetch failed');
        saved = await res.json();
    } catch (e) {
        console.error('Failed to load saved schedule', e);
        saved = [];
    }
}

async function persistSaved() {
    try {
        const res = await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saved)
        });
        if (!res.ok) throw new Error('persist failed');
        saved = await res.json();
    } catch (e) {
        console.error('Failed to persist schedule', e);
        throw e;
    }
}

// Build iCalendar (.ics) content from current `saved` entries
function buildIcs() {
    const lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//calendarapp//EN');

    const pad = (n) => n.toString().padStart(2, '0');

    const toUtcStamp = (date) => {
        // format as YYYYMMDDTHHMMSSZ using UTC
        return date.getUTCFullYear().toString()
            + pad(date.getUTCMonth() + 1)
            + pad(date.getUTCDate())
            + 'T'
            + pad(date.getUTCHours())
            + pad(date.getUTCMinutes())
            + pad(date.getUTCSeconds())
            + 'Z';
    };

    const formatLocalToUtc = (y, m, d, time) => {
        if (!time || time === '終日') return null;
        const [hh, mm] = time.split(':').map(s => parseInt(s, 10));
        // month in Date constructor is 0-based
        const local = new Date(y, m - 1, d, hh, mm, 0);
        return toUtcStamp(local);
    };

    const uidBase = Date.now();

    if (Array.isArray(saved)) {
        saved.forEach((plan, pIdx) => {
            const dates = Array.isArray(plan.date) ? plan.date : [];
            dates.forEach((dateKey, dIdx) => {
                const parts = String(dateKey).split('-').map(s => parseInt(s, 10));
                if (parts.length < 3) return;
                const year = parts[0];
                const monthIndex = parts[1];
                const day = parts[2];
                const month = monthIndex + 1; // stored monthIndex is zero-based

                const isAllDay = !plan.onestartTime && plan.oneendTime === '終日';
                const dtStartUtc = formatLocalToUtc(year, month, day, isAllDay ? null : plan.onestartTime);
                const dtEndUtc = formatLocalToUtc(year, month, day, isAllDay ? null : plan.oneendTime);

                lines.push('BEGIN:VEVENT');
                const uid = `${uidBase}-${pIdx}-${dIdx}@calendarapp`;
                lines.push(`UID:${uid}`);
                // DTSTAMP: now in UTC
                lines.push(`DTSTAMP:${toUtcStamp(new Date())}`);
                if (isAllDay) {
                    const dateStr = `${year}${pad(month)}${pad(day)}`;
                    lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
                    // set DTEND as the next day for all-day events per RFC (exclusive)
                    const next = new Date(year, month - 1, day + 1);
                    lines.push(`DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth()+1)}${pad(next.getDate())}`);
                } else {
                    if (dtStartUtc) lines.push(`DTSTART:${dtStartUtc}`);
                    if (dtEndUtc) lines.push(`DTEND:${dtEndUtc}`);
                }
                const summary = (plan.place || '予定').toString().replace(/\r?\n/g, ' ');
                lines.push(`SUMMARY:${summary}`);
                if (plan.place) lines.push(`LOCATION:${plan.place}`);
                lines.push('END:VEVENT');
            });
        });
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

function downloadIcs(filename = 'calendar.ics') {
    const ics = buildIcs();
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

   

function rendercalendar(element, year = new Date().getFullYear(), monthIndex = new Date().getMonth(), mode = "main") {
    element.innerHTML = "";

     const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    if (mode === "bulk") {
        if (thisMonthBulk) thisMonthBulk.textContent = `${monthIndex+1}月`;
    } else {
        if (thisMonth) thisMonth.textContent = `${monthIndex+1}月`;
    }


    for (let blank = 0; blank < startWeekday; blank++) {
        const blankCell = document.createElement("li");
        blankCell.classList.add("day-empty");
        element.append(blankCell);
    }

    for (let day = 1; day <= totalDays; day++) {
       const dayCell = document.createElement("li");
       dayCell.textContent = `${day}`;
       dayCell.id = `day${day}`;
       const key = `${year}-${monthIndex}-${day}`;
       const key2 = `${year}-${monthIndex+1}-${day}`;

       // restore selection state if previously selected
       if (selectedDates.has(key)) {
           dayCell.classList.add("daySelected");
       }

       if (mode === "bulk") {
           dayCell.addEventListener("click", () => {
               if (selectedDates.has(key)) {
                   selectedDates.delete(key);
                   dayCell.classList.remove("daySelected");
               } else {
                   selectedDates.add(key);
                   dayCell.classList.add("daySelected");
               }
           });
       } else {
           // main mode: open detail view for this date
           dayCell.addEventListener("click", () => openDayDetails(key,key2));
       }

       const eventArea = document.createElement("div");
    eventArea.classList.add("event-area");
       eventArea.style.fontSize = "0.8rem";
       eventArea.style.color = "blue";
       eventArea.style.marginTop = "0.5px";

       // show each saved plan for this date on a separate line
       const plansForThisDate = [];
       if (Array.isArray(saved) && saved.length > 0) {
           for (let j = 0; j < saved.length; j++) {
               const savedate = saved[j].date || [];
               if (savedate.includes(key)) {
                   plansForThisDate.push(saved[j]);
               }
           }
       }

       if (plansForThisDate.length > 0) {
           eventArea.style.whiteSpace = "pre-line";
           eventArea.textContent = plansForThisDate
               .map(plan => `${plan.place} ${plan.onestartTime}〜${plan.oneendTime}`)
               .join("\n");
       }

// open a modal showing all plans for a given dateKey (e.g. "2026-7-23")
       dayCell.append(eventArea);
       element.append(dayCell);
       
       
       
       
    }

}

// open a modal showing all plans for a given dateKey (e.g. "2026-7-23")
function openDayDetails(dateKey, dateKey2) {
    // use in-memory saved (loaded from server)
    const savedPlans = Array.isArray(saved) ? saved.slice() : [];

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.4)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";

    const box = document.createElement("div");
    box.style.background = "#fff";
    box.style.padding = "16px";
    box.style.borderRadius = "8px";
    box.style.width = "90%";
    box.style.maxWidth = "480px";
    box.style.maxHeight = "80%";
    box.style.overflow = "auto";

    const h = document.createElement("h3");
    h.textContent = dateKey2;
    box.appendChild(h);

    const list = document.createElement("div");
    if (savedPlans.length === 0) {
        const p = document.createElement("p");
        p.textContent = "予定はありません。";
        list.appendChild(p);
    } else {
        let found = false;
        savedPlans.forEach((plan, idx) => {
            const dates = plan.date || [];
            if (dates.includes(dateKey)) {
                found = true;
                const item = document.createElement("div");
                item.style.display = "flex";
                item.style.justifyContent = "space-between";
                item.style.alignItems = "center";
                item.style.padding = "8px 0";
                const info = document.createElement("div");
                info.textContent = `${plan.place} ${plan.onestartTime}〜${plan.oneendTime}`;
                const del = document.createElement("button");
                del.textContent = "削除";
                del.style.marginLeft = "8px";
                del.addEventListener("click", async () => {
                    // remove the whole plan entry by object reference (safer than using idx)
                    const i = saved.indexOf(plan);
                    if (i !== -1) {
                        saved.splice(i, 1);
                        try {
                            await persistSaved();
                            rendercalendar(daysGrid, current.year, current.monthIndex, "main");
                        } catch (e) {
                            window.alert('削除に失敗しました');
                        }
                    }
                    // remove this item from DOM
                    item.remove();
                });
                item.appendChild(info);
                item.appendChild(del);
                list.appendChild(item);
            }
        });
        if (!found) {
            const p = document.createElement("p");
            p.textContent = "予定はありません。";
            list.appendChild(p);
        }
    }

    box.appendChild(list);

    const close = document.createElement("button");
    close.textContent = "閉じる";
    close.style.marginTop = "12px";
    close.addEventListener("click", () => overlay.remove());
    box.appendChild(close);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}




// load from server then render
async function initCalendar() {
    // query DOM elements now that DOM is ready
    daysGrid = document.querySelector("#days-grid");
    addbulkbutton = document.querySelector("#add-bulk-plan");
    addplanscreen = document.querySelector("#addplanscreen");
    appcontainer = document.querySelector("#app-container");
    daysGridbulk = document.querySelector("#days-grid-bulk");
    customlocationplace = document.querySelector("#custom-location-place");
    nextbutton = document.querySelector("#nextbutton");
    backbutton = document.querySelector("#backbutton");
    thisMonth = document.querySelector("#this-month");
    nextmonth = document.querySelector("#next-month");
    prevmonth = document.querySelector("#prev-month");
    thisMonthBulk = document.querySelector("#this-month-bulk");
    nextmonthbulk = document.querySelector("#next-month-bulk");
    prevmonthbulk = document.querySelector("#prev-month-bulk");
    exportIcsButton = document.querySelector('#export-ics');

    // Fallback for browsers that don't support input[type=time] (some mobile browsers)
    const testTimeInput = document.createElement('input');
    testTimeInput.setAttribute('type', 'time');
    const timeSupported = testTimeInput.type === 'time';
    if (!timeSupported) {
        const replaceTimeWithSelect = (id, defaultValue) => {
            const orig = document.getElementById(id);
            if (!orig) return;
            const container = document.createElement('span');
            container.style.display = 'inline-flex';
            container.style.gap = '4px';

            const [defH, defM] = (defaultValue || '18:30').split(':');
            const hour = document.createElement('select');
            hour.id = id; // keep same id so other code can query
            for (let h = 0; h < 24; h++) {
                const opt = document.createElement('option');
                opt.value = String(h).padStart(2, '0');
                opt.textContent = String(h).padStart(2, '0');
                if (String(h).padStart(2, '0') === defH) opt.selected = true;
                hour.appendChild(opt);
            }

            const minute = document.createElement('select');
            minute.dataset.minutePart = 'true';
            minute.id = id + '-minute';
            ['00','15','30','45'].forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                if (m === defM) opt.selected = true;
                minute.appendChild(opt);
            });

            // expose value property to mimic input[type=time]
            // keep reference to minute select for disabling
            hour.dataset.pairId = minute.id;
            Object.defineProperty(hour, 'value', {
                get() { return `${hour.querySelector('option:checked').value}:${minute.querySelector('option:checked').value}`; }
            });

            container.appendChild(hour);
            container.appendChild(document.createTextNode(':'));
            container.appendChild(minute);
            orig.replaceWith(container);
        };

        // replace both start and end if present
        replaceTimeWithSelect('start-time', '18:30');
        replaceTimeWithSelect('end-time', '21:00');
    }

    await loadSaved();
    // render grids
    if (daysGrid) rendercalendar(daysGrid, current.year, current.monthIndex);
    if (daysGridbulk) rendercalendar(daysGridbulk, current.year, current.monthIndex, "bulk");

    // attach event listeners that depend on DOM elements
    if (prevmonth) prevmonth.addEventListener("click", () => changeMonth(-1));
    if (nextmonth) nextmonth.addEventListener("click", () => changeMonth(1));
    if (prevmonthbulk) prevmonthbulk.addEventListener("click", () => changeMonth(-1));
    if (nextmonthbulk) nextmonthbulk.addEventListener("click", () => changeMonth(1));

    if (addbulkbutton) addbulkbutton.addEventListener("click", (event) => {
        rendercalendar(daysGrid, current.year, current.monthIndex)
        if (addplanscreen) addplanscreen.classList.remove("hidden");
        if (appcontainer) appcontainer.classList.add("hidden");
        // clear any previous selections when entering bulk mode
        selectedDates.clear();
        document.querySelectorAll("#days-grid-bulk li.daySelected").forEach(el => el.classList.remove("daySelected"));
        if (daysGridbulk) rendercalendar(daysGridbulk, current.year, current.monthIndex, "bulk");
    });

    if (nextbutton) nextbutton.addEventListener("click", async (event) => {
        const onePlace = document.querySelector(`#practiceplace input[name="place"]:checked`);
        if (!onePlace) {
            window.alert("場所を選択してください！");
            return;
        }

        const allDayRadio = document.querySelector('input[name="time"][value="終日"]');
        const startTimeEl = document.querySelector("#start-time");
        const endTimeEl = document.querySelector("#end-time");
        let startTime = startTimeEl ? startTimeEl.value : "";
        let endTime = endTimeEl ? endTimeEl.value : "";

        if (allDayRadio && startTimeEl && endTimeEl) {
            const syncTimeInputs = () => {
                const checked = allDayRadio.checked;
                const disablePair = (el, disabled) => {
                    try {
                        el.disabled = disabled;
                    } catch (e) {}
                    const pairId = el.dataset && el.dataset.pairId;
                    if (pairId) {
                        const pair = document.getElementById(pairId);
                        if (pair) pair.disabled = disabled;
                    } else {
                        const maybe = el.nextElementSibling;
                        if (maybe && maybe.dataset && maybe.dataset.minutePart) maybe.disabled = disabled;
                    }
                };
                if (startTimeEl) disablePair(startTimeEl, checked);
                if (endTimeEl) disablePair(endTimeEl, checked);
                if (checked) {
                    startTime = "";
                    endTime = "終日";
                }
            };

            allDayRadio.addEventListener("change", syncTimeInputs);
            syncTimeInputs();
        }

        let oneAddPlace = "";

        if (onePlace.id === "custom-location-check") {
            oneAddPlace = customlocationplace.value.trim();
            if (oneAddPlace === "") {
                window.alert("場所を入力してください！");
                return;
            }
        } else {
            oneAddPlace = onePlace.value;
        }


        saved.push({
            date: Array.from(selectedDates),
            place: oneAddPlace,
            onestartTime: startTime,
            oneendTime: endTime
        });

        try {
            await persistSaved();
            console.log('saved to server', saved);
        } catch (e) {
            window.alert('予定の保存に失敗しました');
            return;
        }

        // clear selection state so next addition starts fresh
        selectedDates.clear();
        document.querySelectorAll("#days-grid-bulk li.daySelected").forEach(el => el.classList.remove("daySelected"));

        if (addplanscreen) addplanscreen.classList.add("hidden");
        if (appcontainer) appcontainer.classList.remove("hidden");
        if (daysGrid) rendercalendar(daysGrid, current.year, current.monthIndex);
    });

    if (backbutton) backbutton.addEventListener("click", (event) => {
        selectedDates.clear();
        document.querySelectorAll("#days-grid-bulk li.daySelected").forEach(el => el.classList.remove("daySelected"));
        if (addplanscreen) addplanscreen.classList.add("hidden");
        if (appcontainer) appcontainer.classList.remove("hidden");
        if (daysGrid) rendercalendar(daysGrid, current.year, current.monthIndex);
    });

    if (exportIcsButton) exportIcsButton.addEventListener('click', () => {
        try {
            downloadIcs();
        } catch (e) {
            console.error('Failed to generate ICS', e);
            window.alert('ICSの生成に失敗しました');
        }
    });

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalendar);
} else {
    initCalendar();
}

    



// helpers to change month and re-render
function changeMonth(delta) {
    const d = new Date(current.year, current.monthIndex + delta, 1);
    console.log(d);
    current.year = d.getFullYear();
    current.monthIndex = d.getMonth();
    rendercalendar(daysGrid, current.year, current.monthIndex, "main");
    if (daysGridbulk) rendercalendar(daysGridbulk, current.year, current.monthIndex, "bulk");
}

