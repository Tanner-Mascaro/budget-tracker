

// TODO: replace with your Apps Script Web App /exec URL once deployed
const SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyEwp_n41jibvnU8kFZ3ABuCc3m-C9phQ16VkMnSGpL99F3zAn-JoSZoURrIjHsltBzQQ/exec';

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js');
    });
}

let csvRows = [['Name', 'Item', 'Price', 'Date']];


function addRecord() {
    const personNameInput = document.getElementById('person_name');
    const nameInput = document.getElementById('item');
    const amountInput = document.getElementById('item_amount');

    if (!personNameInput.value || !nameInput.value || !amountInput.value) {
        alert('Please fill out all fields!');
        return;
    }

    const personName = personNameInput.value;
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

    // Clear inputs
    personNameInput.value = '';
    nameInput.value = '';
    amountInput.value = '';
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

