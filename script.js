

// TODO: replace with your Apps Script Web App /exec URL once deployed
const SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwlw-duQNLD_DEXvlFAS1lWFfWl53ZDmhE3FAZYVeFUL-_h1zE9gHYSMQZtFuTyxT5_RQ/exec';

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js');
    });
}

let csvRows = [['Name', 'Item', 'Price', 'Date']];

// Remember up to two people's names so they only have to type them once each.
const NAMES_KEY = 'budgetTracker_names';
const SELECTED_NAME_KEY = 'budgetTracker_selectedName';
const MAX_SAVED_NAMES = 2;

const DEFAULT_NAMES = ['Tanner', 'Hannah'];

function getSavedNames() {
    try {
        const stored = JSON.parse(localStorage.getItem(NAMES_KEY));
        if (stored && stored.length > 0) {
            return stored;
        }
    } catch {
        // fall through to defaults
    }
    localStorage.setItem(NAMES_KEY, JSON.stringify(DEFAULT_NAMES));
    return DEFAULT_NAMES;
}

function saveName(name) {
    const names = getSavedNames();
    if (!names.includes(name) && names.length < MAX_SAVED_NAMES) {
        names.push(name);
        localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    }
}

function getSelectedName() {
    return localStorage.getItem(SELECTED_NAME_KEY) || getSavedNames()[0] || '';
}

function setSelectedName(name) {
    localStorage.setItem(SELECTED_NAME_KEY, name);
}

function renderNameSelector() {
    const container = document.getElementById('name_selector');
    const names = getSavedNames();
    const selected = getSelectedName();
    container.innerHTML = '';

    if (names.length > 0) {
        const chipRow = document.createElement('div');
        chipRow.className = 'name_chip_row';
        names.forEach(name => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'name_chip' + (name === selected ? ' selected' : '');
            chip.textContent = name;
            chip.onclick = () => {
                setSelectedName(name);
                renderNameSelector();
            };
            chipRow.appendChild(chip);
        });
        container.appendChild(chipRow);
    }

    if (names.length < MAX_SAVED_NAMES) {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'new_person_name';
        input.placeholder = names.length === 0 ? 'Your name' : 'Add another name';
        container.appendChild(input);
    }
}

// Local YYYY-MM-DD (toISOString would flip to "tomorrow" in the evening for US time zones).
function localDayString(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Day a stored purchase belongs to, as local YYYY-MM-DD.
function dayOf(value) {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const d = new Date(text);
    return isNaN(d) ? '' : localDayString(d);
}

function addRecord() {
    const newNameInput = document.getElementById('new_person_name');
    const nameInput = document.getElementById('item');
    const amountInput = document.getElementById('item_amount');

    let personName = getSelectedName();
    if (newNameInput && newNameInput.value.trim()) {
        personName = newNameInput.value.trim();
        saveName(personName);
        setSelectedName(personName);
    }

    if (!personName || !nameInput.value || !amountInput.value) {
        alert('Please fill out all fields!');
        return;
    }

    const item = nameInput.value;
    const price = amountInput.value;
    // YYYY-MM-DD avoids locale ambiguity (Sheets otherwise reinterprets M/D/Y
    // vs D/M/Y based on its own locale setting, silently corrupting dates)
    const date = localDayString(new Date());

    // Clean data to prevent CSV corruption (escape internal quotes)
    const cleanPersonName = `"${personName.replace(/"/g, '""')}"`;
    const cleanItem = `"${item.replace(/"/g, '""')}"`;
    const cleanPrice = `"${price.replace(/"/g, '""')}"`;
    const cleanDate = `"${date}"`;

    // Push the new row array
    csvRows.push([cleanPersonName, cleanItem, cleanPrice, cleanDate]);

    // Visual feedback
    const preview = document.getElementById('preview');
    if (preview) {
        preview.textContent = JSON.stringify(csvRows, null, 2);
    }

    // Send to the Google Sheet
    sendToSheet({ name: personName, item, price, date });

    // Update the list locally right away instead of waiting on the sheet.
    const record = { name: personName, item, price, date };
    if (historyData !== null) {
        historyData.push(record);
    }
    recentRecords.push(record);
    renderHistory();

    flashAddButton();

    // Clear inputs and refresh the name selector (may now show a new chip)
    nameInput.value = '';
    amountInput.value = '';
    renderNameSelector();
}

renderNameSelector();

// ---- Button feedback ----

let flashTimer = null;
let toastTimer = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// Small burst of confetti from the button.
const SPARK_COLORS = ['#5aa578', '#91cda5', '#ffd166', '#ff8fa3', '#7c9cf5', '#ffffff'];

function launchSparks(origin) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = origin.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 22; i++) {
        const spark = document.createElement('span');
        const size = 5 + Math.random() * 5;
        spark.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;` +
            `border-radius:${Math.random() < 0.5 ? '50%' : '2px'};pointer-events:none;z-index:1000;` +
            `background:${SPARK_COLORS[i % SPARK_COLORS.length]}`;
        document.body.appendChild(spark);

        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * 90;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance - 30; // bias upward
        spark.animate([
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 60}px)) rotate(${Math.random() * 540}deg) scale(0.4)`, opacity: 0 },
        ], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)' })
            .onfinish = () => spark.remove();
    }
}

// Short two-note chime, synthesized so no audio file is needed.
let audioCtx = null;

function playChime() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        [880, 1318.5].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.09;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    } catch {
        // sound is optional
    }
}

function flashAddButton() {
    const button = document.getElementById('add_button');
    button.textContent = 'Added \u2713';
    button.classList.add('done');
    showToast('\u2713 Added to History');
    launchSparks(button);
    playChime();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
        button.textContent = 'Add Purchase';
        button.classList.remove('done');
    }, 1400);
}

// ---- Edit / delete ----

const recentRecords = []; // purchases added this session; merged into the list if a fetch lands without them

function formatPrice(price) {
    return `$${(parseFloat(price) || 0).toFixed(2)}`;
}

function deleteRecord(record) {
    if (!confirm(`Delete "${record.item}" (${formatPrice(record.price)})?`)) return;

    sendToSheet({ action: 'delete', original: { ...record } });

    [historyData, recentRecords].forEach(list => {
        const i = list ? list.indexOf(record) : -1;
        if (i !== -1) list.splice(i, 1);
    });
    renderHistory();
}

function editRecord(record) {
    const newItem = prompt('Item:', record.item);
    if (newItem === null) return;
    const newPrice = prompt('Amount:', record.price);
    if (newPrice === null) return;

    if (!newItem.trim() || isNaN(parseFloat(newPrice))) {
        alert('Please enter an item and a valid amount.');
        return;
    }

    const original = { ...record };
    record.item = newItem.trim();
    record.price = String(parseFloat(newPrice));

    sendToSheet({ action: 'edit', original, updated: { item: record.item, price: record.price } });

    renderHistory();
}

function makeActionButton(label, title, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'row_action';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.onclick = handler;
    return button;
}

// Local-midnight parse for plain YYYY-MM-DD so the day doesn't shift with time zone.
function formatShortDate(value) {
    const text = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00`) : new Date(text);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildPurchaseRow(record) {
    const li = document.createElement('li');
    li.className = 'history_row';

    const avatar = document.createElement('span');
    const personIndex = getSavedNames().indexOf(record.name);
    avatar.className = `avatar avatar_${personIndex === -1 ? 'other' : personIndex}`;
    avatar.textContent = (record.name || '?').trim().charAt(0).toUpperCase();

    const main = document.createElement('span');
    main.className = 'history_row_main';
    const item = document.createElement('span');
    item.className = 'history_row_item';
    item.textContent = record.item;
    const meta = document.createElement('span');
    meta.className = 'history_row_name';
    meta.textContent = [record.name, formatShortDate(record.date)].filter(Boolean).join(' \u00B7 ');
    main.append(item, meta);

    const price = document.createElement('span');
    price.className = 'history_row_price';
    price.textContent = formatPrice(record.price);

    const actions = document.createElement('span');
    actions.className = 'row_actions';
    actions.appendChild(makeActionButton('\u270E', 'Edit', () => editRecord(record)));
    actions.appendChild(makeActionButton('\u2715', 'Delete', () => deleteRecord(record)));

    li.append(avatar, main, price, actions);
    return li;
}

// Send a single row to the Purchases Google Sheet via Apps Script Web App
function sendToSheet(record) {
    fetch(SHEET_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(record),
    })
        .then(() => console.log('Sent to sheet'))
        .catch(err => console.error('Failed to save to sheet:', err));
}

// ---- History tab ----

const HISTORY_CACHE_KEY = 'budgetTracker_history';

// Show the last-known list instantly (Apps Script is slow to respond); the
// background fetch below then refreshes it.
function readHistoryCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(HISTORY_CACHE_KEY));
        return Array.isArray(cached) ? cached : null;
    } catch {
        return null;
    }
}

function writeHistoryCache() {
    try {
        localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(historyData));
    } catch {
        // cache is only an optimization
    }
}

let historyData = readHistoryCache(); // all purchases; from cache first, then the sheet
let historyRange = null; // null = no filter (show everything); otherwise { start, end } as local YYYY-MM-DD

function showView(view) {
    document.getElementById('view_add').style.display = view === 'add' ? '' : 'none';
    document.getElementById('view_history').style.display = view === 'history' ? '' : 'none';
    document.getElementById('tab_add').classList.toggle('active', view === 'add');
    document.getElementById('tab_history').classList.toggle('active', view === 'history');
    document.getElementById('page_title').textContent = view === 'add' ? 'New Purchase' : 'History';
    window.scrollTo(0, 0);
}

// ---- Date range helpers (all "days" are local YYYY-MM-DD strings) ----

function parseDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDays(day, n) {
    const d = parseDay(day);
    d.setDate(d.getDate() + n);
    return localDayString(d);
}

function daysBetween(from, to) {
    return Math.round((parseDay(to) - parseDay(from)) / 86400000);
}

function formatDay(day) {
    return parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRange(range) {
    return range.start === range.end ? formatDay(range.start) : `${formatDay(range.start)} \u2013 ${formatDay(range.end)}`;
}

function currentWeekRange() {
    const start = localDayString(startOfWeek(new Date()));
    return { start, end: addDays(start, 6) };
}

// Arrows move the selected range back/forward by its own length.
function stepHistory(direction) {
    if (historyRange === null) {
        // Not filtered yet: jump straight into the current week.
        historyRange = currentWeekRange();
    } else {
        const length = daysBetween(historyRange.start, historyRange.end) + 1;
        historyRange = {
            start: addDays(historyRange.start, direction * length),
            end: addDays(historyRange.end, direction * length),
        };
    }
    renderHistory();
}

function clearHistoryFilter() {
    historyRange = null;
    renderHistory();
}

// ---- Range picker (tap a start day, then an end day) ----

let calMonth = null; // first day of the month being shown
let calStart = null;
let calEnd = null;

function openPeriodPicker() {
    const today = localDayString(new Date());
    calStart = historyRange ? historyRange.start : null;
    calEnd = historyRange ? historyRange.end : null;
    calMonth = parseDay((calEnd || today).slice(0, 8) + '01');
    document.getElementById('range_modal').style.display = 'flex';
    renderCalendar();
}

function closePeriodPicker() {
    document.getElementById('range_modal').style.display = 'none';
}

function stepCalMonth(direction) {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + direction, 1);
    renderCalendar();
}

function pickCalDay(day) {
    if (!calStart || calEnd) {
        // Starting a fresh selection
        calStart = day;
        calEnd = null;
    } else if (day < calStart) {
        calEnd = calStart;
        calStart = day;
    } else {
        calEnd = day;
    }
    renderCalendar();
}

function setCalRange(start, end) {
    const today = localDayString(new Date());
    calStart = start;
    calEnd = end > today ? today : end;
    calMonth = parseDay(calStart.slice(0, 8) + '01');
    renderCalendar();
}

function applyPeriodPicker() {
    if (!calStart) return;
    historyRange = { start: calStart, end: calEnd || calStart };
    closePeriodPicker();
    renderHistory();
}

function renderCalendar() {
    const today = localDayString(new Date());
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();

    document.getElementById('cal_title').textContent =
        calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    document.getElementById('cal_next_month').disabled = localDayString(new Date(year, month + 1, 1)) > today;

    const grid = document.getElementById('cal_grid');
    grid.innerHTML = '';
    for (let i = 0; i < calMonth.getDay(); i++) {
        grid.appendChild(document.createElement('span'));
    }

    const lastDay = new Date(year, month + 1, 0).getDate();
    const selectedEnd = calEnd || calStart;
    for (let d = 1; d <= lastDay; d++) {
        const day = localDayString(new Date(year, month, d));
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cal_day';
        cell.textContent = d;
        if (day > today) {
            cell.disabled = true;
        }
        if (day === today) cell.classList.add('cal_today');
        if (calStart && day >= calStart && day <= selectedEnd) cell.classList.add('in_range');
        if (day === calStart) cell.classList.add('range_start');
        if (day === selectedEnd) cell.classList.add('range_end');
        cell.onclick = () => pickCalDay(day);
        grid.appendChild(cell);
    }

    const hint = document.getElementById('cal_hint');
    if (!calStart) hint.textContent = 'Tap a start date';
    else if (!calEnd) hint.textContent = `${formatDay(calStart)} \u2013 tap an end date, or Apply for one day`;
    else hint.textContent = formatRange({ start: calStart, end: calEnd });
    document.getElementById('cal_apply').disabled = !calStart;
}

let historyLoading = false;

async function loadHistory() {
    if (historyLoading) return; // a fetch is already in flight; don't race it
    historyLoading = true;

    if (historyData === null) {
        document.getElementById('history_list').innerHTML = '<li class="history_empty">Loading...</li>';
    }
    try {
        const response = await fetch(SHEET_WEBAPP_URL);
        const fetched = await response.json();
        if (!Array.isArray(fetched)) throw new Error('Unexpected response');

        // Purchases added this session may not be in the sheet response yet; keep
        // them (and reuse their objects so edit/delete still work on them).
        recentRecords.forEach(record => {
            const i = fetched.findIndex(p => p.name === record.name && p.item === record.item &&
                parseFloat(p.price) === parseFloat(record.price));
            if (i !== -1) fetched[i] = record;
            else fetched.push(record);
        });
        historyData = fetched;
    } catch (err) {
        console.error('Failed to load history:', err);
        if (historyData === null) historyData = [];
    }
    historyLoading = false;
    renderHistory();
}

// Sunday-based start of the week containing `date`, at midnight.
function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function renderToday() {
    const today = localDayString(new Date());
    const todays = (historyData || []).filter(p => dayOf(p.date) === today);
    const total = todays.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);

    document.getElementById('today_total').textContent = formatPrice(total);
    document.getElementById('today_count').textContent = todays.length === 0
        ? 'Nothing added yet today'
        : `${todays.length} purchase${todays.length === 1 ? '' : 's'}`;

    const people = document.getElementById('today_people');
    people.innerHTML = '';
    if (todays.length === 0) return;

    getSavedNames().forEach((name, index) => {
        const spent = todays
            .filter(p => p.name === name)
            .reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
        const chip = document.createElement('span');
        chip.className = 'today_person';
        const dot = document.createElement('span');
        dot.className = `avatar avatar_${index} avatar_small`;
        dot.textContent = name.trim().charAt(0).toUpperCase();
        chip.append(dot, `${formatPrice(spent)}`);
        people.appendChild(chip);
    });
}

function renderHistory() {
    const list = document.getElementById('history_list');
    const totalEl = document.getElementById('history_total');
    const periodLabel = document.getElementById('period_label');
    const prevBtn = document.getElementById('prev_period_btn');
    const nextBtn = document.getElementById('next_period_btn');
    const clearBtn = document.getElementById('clear_filter_btn');

    if (historyData === null) {
        return; // nothing cached and still loading
    }

    renderToday();

    let purchases;
    if (historyRange === null) {
        // No filter applied: show everything.
        purchases = historyData;
        periodLabel.textContent = 'All Purchases';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        clearBtn.style.display = 'none';
    } else {
        // Compare local calendar days as strings; parsing "YYYY-MM-DD" with
        // new Date() lands on UTC midnight, which is the evening before here.
        purchases = historyData.filter(p => {
            const day = dayOf(p.date);
            return day >= historyRange.start && day <= historyRange.end;
        });
        periodLabel.textContent = formatRange(historyRange);
        prevBtn.disabled = false;
        nextBtn.disabled = historyRange.end >= localDayString(new Date());
        clearBtn.style.display = '';
    }

    writeHistoryCache();

    // Newest first (reverse first so later entries win ties on the same date)
    const sorted = [...purchases].reverse().sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date)));

    const total = sorted.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
    totalEl.textContent = `$${total.toFixed(2)}`;

    list.innerHTML = '';
    if (sorted.length === 0) {
        list.innerHTML = '<li class="history_empty">No purchases yet</li>';
        return;
    }

    sorted.forEach(p => list.appendChild(buildPurchaseRow(p)));
}

// Apps Script has a slow "cold start", so draw the cached list immediately and
// refresh it from the sheet in the background.
renderHistory();
loadHistory();

