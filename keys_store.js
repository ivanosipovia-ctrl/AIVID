const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ключ вида sk-имя.подпись. Подпись — HMAC от ADMIN_SECRET, то есть
// сервер проверяет ключ математикой и без файла: рестарты, стирание
// диска и редеплои ему не страшны. keys.json ведётся как журнал
// (список и счётчики) — локально он полный, на render пока живёт файл,
// список дублируется в браузере.
const KEYS_FILE = path.join(__dirname, 'keys.json');
let secret = 'change-me-admin';

const sign = name =>
  crypto.createHmac('sha256', secret).update(name).digest('hex').slice(0, 32);

function readFile() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; }
}
function writeFile(data) {
  try { fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2)); } catch {}
}

async function init(adminSecret) {
  if (adminSecret) secret = adminSecret;
  if (!fs.existsSync(KEYS_FILE)) writeFile({});
}

async function create(name) {
  name = String(name || 'key').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'key';
  const key = `sk-${name}.${sign(name)}`;
  const data = readFile();
  data[key] = {
    name,
    createdAt: (data[key] && data[key].createdAt) || new Date().toISOString(),
    uses: (data[key] && data[key].uses) || 0
  };
  writeFile(data);
  return key;
}

async function list() {
  return Object.entries(readFile()).map(([k, v]) => ({ key: k, ...v }));
}

async function remove(key) {
  const data = readFile();
  delete data[key];
  writeFile(data);
}

function bump(key, name) {
  const data = readFile();
  if (!data[key]) data[key] = { name, createdAt: new Date().toISOString(), uses: 0 };
  data[key].uses = (data[key].uses || 0) + 1;
  data[key].lastUsed = new Date().toISOString();
  writeFile(data);
}

async function touch(key) {
  // 1. самоподписывающийся ключ — валиден всегда, даже без файла
  if (typeof key === 'string' && key.startsWith('sk-')) {
    const body = key.slice(3);
    const i = body.lastIndexOf('.');
    if (i > 0) {
      const name = body.slice(0, i);
      const sig = body.slice(i + 1);
      if (sig === sign(name)) {
        bump(key, name);
        return true;
      }
    }
  }
  // 2. старые случайные ключи — валидны, пока живёт файл
  const data = readFile();
  if (data[key]) {
    bump(key, data[key].name);
    return true;
  }
  return false;
}

module.exports = { init, create, list, remove, touch };
