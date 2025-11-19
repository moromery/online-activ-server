// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// ===== البورت مظبط تلقائي على Railway =====
const PORT = process.env.PORT || 3000;

const LICENSE_SECRET = "MORO_POS_SECRET_KEY_2024_SECURE";
const LICENSES_DB_PATH = './licenses.json';

app.use(cors());
app.use(bodyParser.json());

// ===== لو مجلد admin موجود، استخدمه =====
const adminPath = path.join(__dirname, 'admin');
if (fs.existsSync(adminPath)) {
  app.use('/admin', express.static(adminPath));
}

// ===== Helpers =====
const readLicenses = () => {
  if (!fs.existsSync(LICENSES_DB_PATH)) {
    fs.writeFileSync(LICENSES_DB_PATH, '{}'); // ينشئ الملف لو مش موجود
    return {};
  }
  return JSON.parse(fs.readFileSync(LICENSES_DB_PATH, 'utf8'));
};

const writeLicenses = (licenses) => {
  fs.writeFileSync(LICENSES_DB_PATH, JSON.stringify(licenses, null, 2));
};

const generateSerial = () => {
  const part = () => Math.floor(1000 + Math.random() * 9000);
  return `MORO-${part()}-${part()}-${part()}`;
};

// ===== Endpoints =====

// توليد سيريال جديد
app.post('/generate-serial', (req, res) => {
  const { customerName } = req.body;
  if (!customerName) return res.status(400).json({ success:false, message:"اسم العميل مطلوب" });

  const licenses = readLicenses();
  const serialKey = generateSerial();

  licenses[serialKey] = {
    active: true,
    hwid: null,
    customerName: customerName.trim(),
    createdAt: new Date().toISOString(),
    activatedAt: null
  };

  writeLicenses(licenses);

  const token = jwt.sign({ serialKey, customerName }, LICENSE_SECRET);

  res.json({ success:true, serialKey, customerName, token });
});

// تفعيل السيريال على جهاز العميل
app.post('/activate', (req, res) => {
  const { serialKey, hwid, customerName } = req.body;
  if (!serialKey || !hwid || !customerName) return res.status(400).json({ success:false, message:"البيانات غير مكتملة" });

  const licenses = readLicenses();
  const license = licenses[serialKey];

  if (!license) return res.status(404).json({ success:false, message:"السيريال غير صحيح" });

  if (license.customerName.toLowerCase() !== customerName.trim().toLowerCase()) {
    return res.status(401).json({ success:false, message:"اسم العميل غير مطابق للسيريال" });
  }

  if (license.hwid && license.hwid !== hwid) {
    return res.status(403).json({ success:false, message:"السيريال مستخدم على جهاز آخر" });
  }

  if (!license.hwid) {
    license.hwid = hwid;
    license.activatedAt = new Date().toISOString();
    writeLicenses(licenses);
    console.log(`Activated License ${serialKey} for customer '${customerName}' on HWID ${hwid}`);
  }

  const token = jwt.sign({ serialKey, hwid, customerName }, LICENSE_SECRET);
  res.json({ success:true, serialKey, hwid, customerName, token });
});

// استرجاع كل السيريالات (Dashboard)
app.get('/licenses', (req, res) => {
  const licenses = readLicenses();
  res.json(licenses);
});

// حذف سيريال
app.delete('/licenses/:serialKey', (req, res) => {
  const { serialKey } = req.params;
  const licenses = readLicenses();

  if (!licenses[serialKey]) return res.status(404).json({ success:false, message:"السيريال غير موجود" });

  delete licenses[serialKey];
  writeLicenses(licenses);
  res.json({ success:true, message:"تم حذف السيريال بنجاح" });
});

// تعديل سيريال (مثلاً تغيير اسم العميل)
app.put('/licenses/:serialKey', (req, res) => {
  const { serialKey } = req.params;
  const { customerName, hwid } = req.body;

  const licenses = readLicenses();
  const license = licenses[serialKey];

  if (!license) return res.status(404).json({ success:false, message:"السيريال غير موجود" });

  if (customerName) license.customerName = customerName.trim();
  if (hwid) license.hwid = hwid;

  writeLicenses(licenses);
  res.json({ success:true, message:"تم تعديل السيريال بنجاح", license });
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`Licensing Server running on port ${PORT}`);
});
