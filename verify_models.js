// проверка: после selectModule(id) страница апстрима реально переключается на эту модель
const { chromium } = require('playwright');

(async () => {
  const ids = [
    'liveportrait', 'cosyvoice', 'seedance', 'happyhorse-1.0-i2v', 'happyhorse-1.1-i2v',
    'viduq3-pro-fast_img2video', 'pixverse-v6-it2v', 'wan22', 'wan22-i2v-flash',
    'wan25-i2v', 'wan26-i2v', 'wan26-i2v-flash', 'wan2.7-i2v', 'wan2.7-videoedit',
    'jimeng_i2v_first_v30', 'wan22-s2v', 'wan25', 'wan26-image'
  ];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://aigc.medicalai.tech/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.module-item').length > 0);

  let bad = 0;
  for (const id of ids) {
    const r = await page.evaluate(id => {
      selectModule(id);
      if (!currentModule) return { selected: null };
      const cfg = (currentTabId && currentModule.tabs)
        ? currentModule.tabs.find(t => t.id === currentTabId) || currentModule
        : currentModule;
      return {
        selected: currentModule.id,
        tab: currentTabId,
        fields: [...document.querySelectorAll('#inputFields [name], #paramsFields [name]')]
          .map(e => e.name).join(',')
      };
    }, id);
    const ok = r.selected === id;
    if (!ok) bad++;
    console.log(`${ok ? 'OK ' : 'BAD'} ${id} -> selected=${r.selected} tab=${r.tab || '-'} fields=[${r.fields}]`);
  }

  // фаза 2: куда реально уйдёт POST при нажатии «генерировать»
  page.on('dialog', d => d.dismiss().catch(() => {}));
  console.log('--- POST endpoints ---');
  for (const id of ids) {
    const url = await page.evaluate(id => {
      selectModule(id);
      window.__post = null;
      const orig = window.fetch;
      window.fetch = (u, opts) => {
        if (opts && opts.method === 'POST') window.__post = String(u);
        return Promise.resolve({ ok: true, json: async () => ({ success: false, error: 'test' }) });
      };
      document.getElementById('generateForm')
        .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      window.fetch = orig;
      return window.__post;
    }, id);
    const ok = url === `/api/generate/${id}`;
    if (!ok) bad++;
    console.log(`${ok ? 'OK ' : 'BAD'} ${id} -> POST ${url}`);
  }

  await browser.close();
  console.log(bad ? `MISMATCH: ${bad}` : 'ALL MODELS ROUTE CORRECTLY');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
