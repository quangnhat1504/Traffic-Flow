const { chromium } = require('playwright');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';

async function testActualDrag() {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Click Load CAM-01 Preset
  await page.click('button.preset-pill-btn:has-text("Load CAM-01 Preset")');
  await page.waitForTimeout(1000);

  // Expand Geometry accordion
  await page.click('.geometry-accordion-header');
  await page.waitForTimeout(500);

  const canvas = await page.$('.step-layout .drawing-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();

  // Vertex 1 is around: padX = 1920 * 0.18 = 345.6, padTop = 1080 * 0.22 = 237.6
  const targetScreenX = box.x + (345.6 / 1920) * box.width;
  const targetScreenY = box.y + (237.6 / 1080) * box.height;

  // Let's add listener to log handleDown
  await page.evaluate(() => {
    window.__dragLogs = [];
  });

  console.log('Mouse down at target:', targetScreenX, targetScreenY);
  await page.mouse.move(targetScreenX, targetScreenY);
  await page.mouse.down();
  await page.mouse.move(targetScreenX + 100, targetScreenY + 50, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const verticesCount = await page.$eval('.tool-panel .metric strong', (el) => el.textContent.trim());
  const cropArea = await page.$$eval('.tool-panel .metric strong', (els) => els.map(e => e.textContent.trim()));
  console.log('Vertices metric:', verticesCount);
  console.log('Crop area metric:', cropArea);

  await browser.close();
}

testActualDrag().catch(console.error);
