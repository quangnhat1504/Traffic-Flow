const { chromium } = require('playwright');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://127.0.0.1:5173?console=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const tag = await page.$eval('.telemetry-session-tag', (el) => el.textContent.trim());
  const total = await page.$eval('.telemetry-total-number', (el) => el.textContent.trim());
  const flow = await page.$eval('.telemetry-flow-val', (el) => el.textContent.trim());
  const cars = await page.$eval('.class-counter-cell:has-text("Cars") .class-counter-value', (el) => el.textContent.trim());
  const fps = await page.$eval('.progress-meta-item:has-text("FPS") strong', (el) => el.textContent.trim());
  const frames = await page.$eval('.progress-meta-item:has-text("Frames Processed") strong', (el) => el.textContent.trim());

  console.log('INITIAL STANDBY STATE:');
  console.log(JSON.stringify({ tag, total, flow, cars, fps, frames }, null, 2));

  await page.screenshot({ path: 'storage/initial_standby_viewport.png' });
  await browser.close();
})();
