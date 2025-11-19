const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const LICENSE_SECRET = "MORO_POS_SECRET_KEY_2024_SECURE";

app.use(bodyParser.json());
app.use(cors());
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// قاعدة بيانات بسيطة للسيريالات المولدة (في الواقع ستكون قاعدة بيانات حقيقية)
const licensesDB = {};

// وظيفة لتوليد سيريال جديد عشوائي
function generateSerial() {
  const part = () => Math.floor(1000 + Math.random() * 9000);
  return `MORO-${part()}-${part()}-${part()}`;
}

// Endpoint لتوليد سيريال جديد (يستخدم من قبل لوحة تحكم الأدمن الخاصة بك)
app.post('/generate-serial', (req, res) => {
  // قمنا بتوحيد التسمية لتكون customerName
  const { customerName, hwid } = req.body;

  if (!customerName) {
    return res.status(400).json({ success: false, message: "اسم العميل مطلوب" });
  }

  const serialKey = generateSerial();
  
  // تخزين البيانات: الاسم، وهل هو مفعل، ومعرف الجهاز (إن وجد مسبقاً)
  licensesDB[serialKey] = { 
    active: true, 
    hwid: hwid || null, 
    customerName: customerName.trim() 
  };

  const token = jwt.sign({
    serialKey,
    hwid: hwid || null,
    customerName,
    activatedAt: new Date().toISOString()
  }, LICENSE_SECRET);

  return res.json({ success: true, serialKey, customerName, token });
});

// Endpoint لتفعيل السيريال من جهاز العميل
app.post('/activate', (req, res) => {
  // نستقبل الآن اسم العميل أيضاً للتحقق
  const { serialKey, hwid, customerName } = req.body;

  if (!serialKey || !hwid || !customerName) {
    return res.status(400).json({ success: false, message: "البيانات غير مكتملة (مطلوب: السيريال، معرف الجهاز، واسم العميل)" });
  }

  const license = licensesDB[serialKey];

  // 1. التحقق من وجود السيريال
  if (!license) {
    return res.status(401).json({ success: false, message: "السيريال غير صحيح" });
  }

  // 2. التحقق من تطابق اسم العميل (لزيادة الأمان ومنع التخمين)
  if (license.customerName.toLowerCase() !== customerName.trim().toLowerCase()) {
    return res.status(401).json({ success: false, message: "اسم العميل غير مطابق لهذا السيريال" });
  }

  // 3. التحقق من ربط الجهاز (HWID Binding)
  if (license.hwid !== null && license.hwid !== hwid) {
    return res.status(403).json({ success: false, message: "هذا السيريال مستخدم بالفعل على جهاز آخر" });
  }

  // 4. التفعيل لأول مرة (ربط السيريال بالجهاز)
  if (license.hwid === null) {
    license.hwid = hwid;
    console.log(`Activated License ${serialKey} for customer '${customerName}' on Machine ${hwid}`);
  }

  const token = jwt.sign({
    serialKey,
    hwid,
    customerName: license.customerName,
    activatedAt: new Date().toISOString()
  }, LICENSE_SECRET);

  return res.json({ success: true, token });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Licensing Server running on port ${PORT}`);
});