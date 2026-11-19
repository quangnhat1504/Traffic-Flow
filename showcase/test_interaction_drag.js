const { chromium } = require('playwright');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';

async function testDragInteraction() {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Click Load CAM-01 Preset
  await page.click('button.preset-pill-btn:has-text("Load CAM-01 Preset")');
  await page.waitForTimeout(1000);

  // Expand Geometry accordion
  await page.click('.geometry-accordion-header');
  await page.waitForTimeout(800);

  // Get initial vertices
  const initialVerticesCount = await page.$eval('.tool-panel .metric strong', (el) => el.textContent.trim());
  console.log('Initial vertices count:', initialVerticesCount);

  // Get canvas element
  const canvas = await page.$('.step-layout .drawing-canvas');
  const box = await canvas.boundingBox();
  console.log('Canvas bounding box:', box);

  // Vertex 1 is around padX = 1920 * 0.18 = 345.6, padTop = 1080 * 0.22 = 237.6
  // On screen canvas, that corresponds to box.x + box.width * 0.18, box.y + box.height * 0.22
  const v1ScreenX = box.x + box.width * 0.18;
  const v1ScreenY = box.y + box.height * 0.22;
  console.log('Targeting vertex 1 at:', v1ScreenX, v1ScreenY);

  // Try to drag vertex 1
  await page.mouse.move(v1ScreenX, v1ScreenY);
  await page.mouse.down();
  await page.mouse.move(v1ScreenX + 80, v1ScreenY + 80, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Check vertices count now
  const newVerticesCount = await page.$eval('.tool-panel .metric strong', (el) => el.textContent.trim());
  console.log('New vertices count after drag attempt:', newVerticesCount);

  // Get crop area text
  const cropArea = await page.$$eval('.tool-panel .metric strong', (els) => els.map(e => e.textContent.trim()));
  console.log('Metrics:', cropArea);

  // Also test clicking outside any vertex
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.1);
  await page.waitForTimeout(500);
  const countAfterClick = await page.$eval('.tool-panel .metric strong', (el) => el.textContent.trim());
  console.log('Count after click on canvas:', countAfterClick);

  // Now test Step 2
  await page.click('button.source-mode-pill:has-text("2. Lanes & Counting Lines")');
  await page.waitForTimeout(800);

  // Check lanes in step 2
  const laneNames = await page.$$eval('.lane-card input', (inputs) => inputs.map(i => i.value));
  console.log('Lane names in Step 2:', laneNames);

  await browser.close();
}

testDragInteraction().catch(console.error);
