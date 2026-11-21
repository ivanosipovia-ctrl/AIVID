const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { runGeneration } = require('./automation');

const PORT = process.env.PORT || 3000;
const UPSTREAM = 'https://aigc.medicalai.tech';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-me-admin';
const store = require('./keys_store');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${file.originalname}`)
  })
});

// ---- конфиг моделей с апстрима (кэш 10 мин) ----
let cache = { at: 0, data: null };
async function getModels() {
  if (cache.data && Date.now() - cache.at < 600000) return cache.data;
  const r = await fetch(`${UPSTREAM}/api/modules`);
  if (!r.ok) throw new Error('апстрим недоступен: ' + r.status);
  cache = { at: Date.now(), data: await r.json() };
  return cache.data;
}
const configOf = (m, tabId) =>
  (tabId && m.tabs ? m.tabs.find(t => t.id === tabId) : null) || m;

// ---- ключи ----
async function auth(req, res, next) {
  try {
    const key = req.headers['x-api-key'];
    if (key && !(await store.touch(key)))
      return res.status(401).json({ error: 'неверный API ключ' });
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
function admin(req, res, next) {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET)
    return res.status(403).json({ error: 'нет доступа' });
  next();
}

app.post('/api/keys', admin, async (req, res) => {
  try {
    res.json({ key: await store.master(), name: 'main (постоянный)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/keys', admin, async (req, res) => {
  try { res.json(await store.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/keys/:key', admin, async (req, res) => {
  try {
    await store.remove(req.params.key);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- модели ----
app.get('/api/models', auth, async (req, res) => {
  try { res.json(await getModels()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// ---- генерация (очередь, по одной задаче) ----
const tasks = new Map();
const queue = [];
let busy = false;

const cleanup = files => {
  for (const arr of Object.values(files || {}))
    for (const f of arr) fs.unlink(f.path, () => {});
};

app.post(
  '/api/generate',
  auth,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }, { name: 'video', maxCount: 1 }]),
  async (req, res) => {
    try {
      const models = await getModels();
      const model = models.find(m => m.id === req.body.model);
      if (!model) return res.status(400).json({ error: 'неизвестная модель' });

      const tabId = req.body.tab_id || null;
      const cfg = configOf(model, tabId);
      const files = req.files || {};

      // фото-референс и прочие обязательные входы
      for (const raw of cfg.inputs || []) {
        const optional = raw.endsWith('?');
        const type = raw.replace('?', '');
        if (type === 'text') {
          if (!req.body.text && !optional)
            return res.status(400).json({ error: 'заполните промпт' });
        } else if (!files[type] && !optional) {
          cleanup(files);
          return res.status(400).json({
            error: type === 'image'
              ? 'фото-референс обязателен для этой модели'
              : `файл «${type}» обязателен для этой модели`
          });
        }
      }

      let params = {};
      try { params = JSON.parse(req.body.params || '{}'); } catch {}

      const id = crypto.randomUUID();
      tasks.set(id, { status: 'queued', model: model.name, createdAt: new Date().toISOString() });
      queue.push({
        id,
        payload: {
          modelId: model.id,
          tabId,
          text: req.body.text || '',
          params,
          files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v[0].path]))
        },
        rawFiles: files
      });
      res.json({ task_id: id });
      pump();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  const t = tasks.get(job.id);
  t.status = 'running';
  try {
    t.result = await runGeneration({ ...job.payload, upstream: UPSTREAM });
    t.status = 'completed';
  } catch (e) {
    t.status = 'failed';
    t.error = e.message;
  } finally {
    cleanup(job.rawFiles);
    busy = false;
    pump();
  }
}

app.get('/api/task/:id', auth, (req, res) => {
  const t = tasks.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'задача не найдена' });
  res.json(t);
});

store.init(ADMIN_SECRET)
  .then(() => {
    app.listen(PORT, () =>
      console.log(`http://localhost:${PORT} (${process.env.DATABASE_URL ? 'postgres' : 'файл keys.json'})`)
    );
  })
  .catch(e => {
    console.error('не удалось подключить хранилище ключей:', e.message);
    process.exit(1);
  });
