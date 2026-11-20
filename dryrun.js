// сухой прогон: открывает апстрим, выбирает модель, проверяет что поля проставились
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://aigc.medicalai.tech/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.module-item').length > 0);

  // seedance: текст + картинка + параметры
  await page.evaluate(() => selectModule('seedance'));
  await page.waitForSelector('textarea[name="text"]');
  await page.fill('textarea[name="text"]', 'test prompt');
  await page.evaluate(() => {
    for (const [k, v] of Object.entries({ duration: 8, ratio: '9:16', resolution: '720p', seed: 42, camerafixed: true })) {
      const el = document.querySelector(`#paramsFields [name="${k}"]`);
      if (!el) throw new Error('нет поля ' + k);
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
    }
  });
  const vals = await page.evaluate(() => ({
    text: document.querySelector('textarea[name="text"]').value,
    duration: document.querySelector('[name="duration"]').value,
    ratio: document.querySelector('[name="ratio"]').value,
    hasImageInput: !!document.querySelector('input[name="image"]')
  }));
  console.log('seedance:', JSON.stringify(vals));

  // вкладочная модель: wan22, вкладка wait
  await page.evaluate(() => { selectModule('wan22'); switchTab('wait'); });
  await page.waitForSelector('#paramsFields [name="prompt"]');
  const tabs = await page.evaluate(() => ({
    hiddenTab: document.querySelector('[name="tab_id"]')?.value,
    hasPrompt: !!document.querySelector('[name="prompt"]')
  }));
  console.log('wan22/wait:', JSON.stringify(tabs));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
