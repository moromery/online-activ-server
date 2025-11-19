const generateBtn = document.getElementById('generateSerialBtn');
const tableBody = document.querySelector('#serialsTable tbody');

async function fetchSerials() {
    const res = await fetch('/admin/list');
    const data = await res.json();
    tableBody.innerHTML = '';
    for (const key in data) {
        const license = data[key];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${key}</td>
            <td>${license.hwid ? 'مفعل' : 'غير مفعل'}</td>
            <td>${license.hwid || '-'}</td>
            <td>${license.clientName}</td>
        `;
        tableBody.appendChild(row);
    }
}

generateBtn.addEventListener('click', async () => {
    const res = await fetch('/admin/generate');
    const text = await res.text();
    alert(`تم توليد السيريال:\n${text}`);
    fetchSerials();
});

// تحميل السيريالات عند فتح الصفحة
fetchSerials();
