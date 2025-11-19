// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const ADMIN_PASSWORD = "moro123";
const ADMIN_AUTH_ENABLED = true;

const app = express();

// ===== CONFIG (يمكن ضبط المتغيرات البيئية في Railway) =====
const PORT = process.env.PORT || 3000;
const LICENSE_SECRET = process.env.LICENSE_SECRET || "MORO_POS_SECRET_KEY_2024_SECURE";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Moro123"; // يفضل تغييره في env
// لو حبيت تطفّي مصادقة الأدمن (لأغراض اختبارية) ضع ADMIN_AUTH=false في env
const ADMIN_AUTH_ENABLED = process.env.ADMIN_AUTH !== "false";
// لو عايز تحدد origin محدد للأدمن ضع هنا أو في env ADMIN_ORIGIN
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || "*";

// ===== مسار قابل للكتابة في Railway / Heroku / محلي =====
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const LICENSES_DB_PATH = path.join(DATA_DIR, 'licenses.json');

// ===== Middlewares =====
app.use(bodyParser.json());
app.use(cors({ origin: ADMIN_ORIGIN }));

// Serve admin static if folder موجود
const adminPath = path.join(__dirname, 'admin');
if (fs.existsSync(adminPath)) {
  app.use('/admin', express.static(adminPath));
}

// ===== Helpers =====
const safeReadJSON = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}', 'utf8');
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      fs.writeFileSync(filePath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error("safeReadJSON error:", err);
    return {};
  }
};

const safeWriteJSON = (filePath, obj) => {
  try {
    // كتابة آمنة: أولاً نكتب في ملف مؤقت ثم نعيد تسميته
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    console.error("safeWriteJSON error:", err);
    return false;
  }
};

const generateSerialOnce = () => {
  const part = () => Math.floor(1000 + Math.random() * 9000);
  return `MORO-${part()}-${part()}-${part()}`;
};

const generateUniqueSerial = (existing, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const s = generateSerialOnce();
    if (!existing[s]) return s;
  }
  // لو فشل توليد فريد في عدة محاولات، ألجأ للوزن الزمني
  return `MORO-${Date.now()}`;
};

// ===== Auth Middleware for admin endpoints (JWT) =====
const verifyAdminToken = (req, res, next) => {
  if (!ADMIN_AUTH_ENABLED) return next();

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "مطلوب توكن المصادقة" });
  }
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, LICENSE_SECRET);
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "توكن غير صحيح أو منتهي" });
  }
};

// ===== Admin login (يرجع JWT) =====
app.post('/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: "كلمة المرور مطلوبة" });

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "كلمة المرور خاطئة" });
    }

    const token = jwt.sign({ role: 'admin', iat: Math.floor(Date.now() / 1000) }, LICENSE_SECRET, { expiresIn: '12h' });
    return res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// ===== API Endpoints =====

// توليد سيريال واحد أو دفعة (محمي)
app.post('/generate-serial', verifyAdminToken, (req, res) => {
  try {
    const { customerName, quantity } = req.body;
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    if (!customerName || !customerName.toString().trim()) {
      return res.status(400).json({ success: false, message: "اسم العميل مطلوب" });
    }

    const licenses = safeReadJSON(LICENSES_DB_PATH);
    const created = [];

    for (let i = 0; i < qty; i++) {
      const serialKey = generateUniqueSerial(licenses, 20);
      licenses[serialKey] = {
        active: true,
        hwid: null,
        customerName: customerName.toString().trim(),
        createdAt: new Date().toISOString(),
        activatedAt: null
      };
      created.push(serialKey);
    }

    const ok = safeWriteJSON(LICENSES_DB_PATH, licenses);
    if (!ok) return res.status(500).json({ success: false, message: "فشل حفظ السيريالات" });

    // ممكن نرجّع التوكين لكل سيريال إن احتجنا (حالياً نرجع list)
    return res.json({ success: true, created });
  } catch (err) {
    console.error("/generate-serial error:", err);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// تفعيل السيريال (خاص بالعميل) - لا يحتاج توكن الأدمن عادةً
app.post('/activate', (req, res) => {
  try {
    const { serialKey, hwid, customerName } = req.body;
    if (!serialKey || !hwid || !customerName)
      return res.status(400).json({ success: false, message: "البيانات غير مكتملة" });

    const licenses = safeReadJSON(LICENSES_DB_PATH);
    const license = licenses[serialKey];
    if (!license)
      return res.status(404).json({ success: false, message: "السيريال غير صحيح" });

    if ((license.customerName || "").toLowerCase() !== customerName.toString().trim().toLowerCase())
      return res.status(401).json({ success: false, message: "اسم العميل غير مطابق للسيريال" });

    if (license.hwid && license.hwid !== hwid)
      return res.status(403).json({ success: false, message: "السيريال مستخدم على جهاز آخر" });

    if (!license.hwid) {
      license.hwid = hwid;
      license.activatedAt = new Date().toISOString();
      safeWriteJSON(LICENSES_DB_PATH, licenses);
    }

    const token = jwt.sign({ serialKey, hwid, customerName }, LICENSE_SECRET, { expiresIn: '30d' });
    return res.json({ success: true, serialKey, hwid, customerName, token });
  } catch (err) {
    console.error("/activate error:", err);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// استرجاع كل السيريالات (يمكن تركه مفتوحاً أو تغييره ليحتاج توكن)
app.get('/licenses', (req, res) => {
  try {
    const licenses = safeReadJSON(LICENSES_DB_PATH);
    return res.json(licenses);
  } catch (err) {
    console.error("/licenses error:", err);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// حذف سيريال (محمي)
app.delete('/licenses/:serialKey', verifyAdminToken, (req, res) => {
  try {
    const { serialKey } = req.params;
    const licenses = safeReadJSON(LICENSES_DB_PATH);

    if (!licenses[serialKey])
      return res.status(404).json({ success: false, message: "السيريال غير موجود" });

    delete licenses[serialKey];
    safeWriteJSON(LICENSES_DB_PATH, licenses);
    return res.json({ success: true, message: "تم حذف السيريال بنجاح" });
  } catch (err) {
    console.error("/licenses DELETE error:", err);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// تعديل سيريال (محمي)
app.put('/licenses/:serialKey', verifyAdminToken, (req, res) => {
  try {
    const { serialKey } = req.params;
    const { customerName, hwid } = req.body;
    const licenses = safeReadJSON(LICENSES_DB_PATH);
    const license = licenses[serialKey];

    if (!license)
      return res.status(404).json({ success: false, message: "السيريال غير موجود" });

    if (typeof customerName !== 'undefined' && customerName !== null) license.customerName = customerName.toString().trim();
    if (typeof hwid !== 'undefined' && hwid !== null) license.hwid = hwid;

    safeWriteJSON(LICENSES_DB_PATH, licenses);
    return res.json({ success: true, message: "تم تعديل السيريال بنجاح", license });
  } catch (err) {
    console.error("/licenses PUT error:", err);
    return res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// ===== تشغيل السيرفر =====
app.listen(PORT, () => {
  console.log(`Licensing Server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Admin auth enabled: ${ADMIN_AUTH_ENABLED}`);
});
