

// TODO: replace with your Apps Script Web App /exec URL once deployed
const SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyEwp_n41jibvnU8kFZ3ABuCc3m-C9phQ16VkMnSGpL99F3zAn-JoSZoURrIjHsltBzQQ/exec';

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
    const date = new Date().toLocaleDateString();

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

    // Clear inputs and refresh the name selector (may now show a new chip)
    nameInput.value = '';
    amountInput.value = '';
    renderNameSelector();
}

renderNameSelector();

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

