const { chromium } = require('playwright');

// заходит на aigc.medicalai.tech, выбирает модель, заполняет все поля, ждёт результата
async function runGeneration({ modelId, tabId, text, params, files, upstream }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let dialogError = null;
    page.on('dialog', d => {
      dialogError = d.message();
      d.dismiss().catch(() => {});
    });

    await page.goto(upstream, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('.module-item').length > 0, null, { timeout: 60000 });

    // выбор модели и вкладки (те же глобальные функции, что использует сам сайт)
    await page.evaluate(({ modelId, tabId }) => {
      selectModule(modelId);
      if (tabId && typeof switchTab === 'function') switchTab(tabId);
    }, { modelId, tabId });

    // файлы: image / audio / video
    for (const [type, filePath] of Object.entries(files || {})) {
      if (filePath) await page.setInputFiles(`input[name="${type}"]`, filePath);
    }

    if (text) await page.fill('#textInput, textarea[name="text"]', text);

    // параметры формы
    await page.evaluate(params => {
      for (const [k, v] of Object.entries(params)) {
        const el = document.querySelector(`#paramsFields [name="${k}"]`);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, params || {});

    await page.click('#generateBtn');

    // сайт сам опрашивает задачу, ждём пока покажет #resultPanel
    const deadline = Date.now() + 25 * 60 * 1000;
    let done = false;
    while (Date.now() < deadline) {
      if (dialogError) throw new Error(dialogError);
      done = await page.evaluate(() => {
        const r = document.getElementById('resultPanel');
        return r && r.style.display === 'block';
      });
      if (done) break;
      await page.waitForTimeout(3000);
    }
    if (dialogError) throw new Error(dialogError);
    if (!done) throw new Error('таймаут генерации (25 мин)');

    const res = await page.evaluate(() => {
      const c = document.getElementById('resultContent');
      const v = c.querySelector('video source[src]') || c.querySelector('video[src]');
      const i = c.querySelector('img[src]');
      const a = c.querySelector('audio[src]');
      const code = c.querySelector('code');
      const link = c.querySelector('a[href]');
      const el = v || i || a;
      return {
        url: el ? el.getAttribute('src') : (link ? link.getAttribute('href') : null),
        type: v ? 'video' : i ? 'image' : a ? 'audio' : code ? 'voice_id' : 'file',
        voiceId: code ? code.textContent.trim() : null
      };
    });

    if (res.url) res.url = new URL(res.url, upstream).toString();
    if (!res.url && !res.voiceId) throw new Error('результат не найден на странице');
    return res;
  } finally {
    await browser.close();
  }
}

module.exports = { runGeneration };
