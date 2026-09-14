

// TODO: replace with your Apps Script Web App /exec URL once deployed
const SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzCW4Q2j493S0RL-_iOCkeVvpwrE5uDJ7ruV2akIKBFghXinxsdm1Zfw3n93E8aosj7Hg/exec';

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
    const date = new Date().toISOString().split('T')[0];

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

    // Refresh the cached History data in the background so it's ready by the
    // time the History tab is opened.
    historyData = null;
    loadHistory();

    // Clear inputs and refresh the name selector (may now show a new chip)
    nameInput.value = '';
    amountInput.value = '';
    renderNameSelector();
}

renderNameSelector();

// Don't let the picker select a future date
document.getElementById('week_picker').max = new Date().toISOString().split('T')[0];

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

let historyData = null; // all purchases fetched from the sheet, cached after first load
let historyOffset = null; // null = no filter (show everything); 0 = current week, -1 = one week back, etc.

function showView(view) {
    document.getElementById('view_add').style.display = view === 'add' ? '' : 'none';
    document.getElementById('view_history').style.display = view === 'history' ? '' : 'none';
    document.getElementById('tab_add').classList.toggle('active', view === 'add');
    document.getElementById('tab_history').classList.toggle('active', view === 'history');

    if (view === 'history' && historyData === null) {
        // Only fetch the first time History is opened; later opens reuse the
        // cached data so repeated taps can't race each other.
        loadHistory();
    }
}

function stepHistory(direction) {
    if (historyOffset === null) {
        // Not filtered yet: jump straight into the current period.
        historyOffset = 0;
    } else {
        // never allow going past the current period
        historyOffset = Math.min(0, historyOffset + direction);
    }
    renderHistory();
}

function clearHistoryFilter() {
    historyOffset = null;
    renderHistory();
}

function openPeriodPicker() {
    const picker = document.getElementById('week_picker');
    if (picker.showPicker) {
        picker.showPicker();
    } else {
        picker.focus();
    }
}

function pickWeek(value) {
    if (!value) return;
    const picked = new Date(`${value}T00:00:00`);
    const diffWeeks = Math.round((startOfWeek(picked) - startOfWeek(new Date())) / (7 * 24 * 60 * 60 * 1000));
    historyOffset = Math.min(0, diffWeeks);
    renderHistory();
}

let historyLoading = false;

async function loadHistory() {
    if (historyLoading) return; // a fetch is already in flight; don't race it
    historyLoading = true;

    const list = document.getElementById('history_list');
    list.innerHTML = '<li class="history_empty">Loading...</li>';
    try {
        const response = await fetch(SHEET_WEBAPP_URL);
        historyData = await response.json();
    } catch (err) {
        console.error('Failed to load history:', err);
        historyData = [];
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

function getWeekRange(offset) {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const label = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    return { start, end, label };
}

function renderHistory() {
    const list = document.getElementById('history_list');
    const totalEl = document.getElementById('history_total');
    const periodLabel = document.getElementById('period_label');
    const prevBtn = document.getElementById('prev_period_btn');
    const nextBtn = document.getElementById('next_period_btn');
    const clearBtn = document.getElementById('clear_filter_btn');

    if (historyData === null) {
        return; // still loading
    }

    let purchases;
    if (historyOffset === null) {
        // No filter applied: show everything.
        purchases = historyData;
        periodLabel.textContent = 'All Purchases';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        clearBtn.style.display = 'none';
    } else {
        const range = getWeekRange(historyOffset);
        purchases = historyData.filter(p => {
            const purchaseDate = new Date(p.date);
            return purchaseDate >= range.start && purchaseDate <= range.end;
        });
        periodLabel.textContent = range.label;
        prevBtn.disabled = false;
        nextBtn.disabled = historyOffset >= 0;
        clearBtn.style.display = '';
    }

    // Newest first
    const sorted = [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = sorted.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
    totalEl.textContent = `$${total.toFixed(2)}`;

    list.innerHTML = '';
    if (sorted.length === 0) {
        list.innerHTML = '<li class="history_empty">No purchases.</li>';
        return;
    }

    sorted.forEach(p => {
        const li = document.createElement('li');
        li.className = 'history_row';
        li.innerHTML = `
            <span class="history_row_main">${p.item} <span class="history_row_name">— ${p.name}</span></span>
            <span class="history_row_price">$${parseFloat(p.price).toFixed(2)}</span>
        `;
        list.appendChild(li);
    });
}

// Apps Script has a slow "cold start" the first time it's called after being
// idle. Kick off the History fetch now, in the background, so it's likely
// already done by the time the History tab is actually opened.
loadHistory();

