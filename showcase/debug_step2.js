const { chromium } = require('playwright');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';

async function testStep2Interactions() {
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

  // Switch to Step 2
  await page.click('button.source-mode-pill:has-text("2. Lanes & Counting Lines")');
  await page.waitForTimeout(500);

  const canvas = await page.$('.step-layout .drawing-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  console.log('Step 2 Canvas Box:', box);

  // Let's get lane coordinates from the page
  const laneData = await page.evaluate(() => {
    // Look at react state or lane data if accessible
    return window.__currentLanes || null;
  });

  // Click on the canvas to draw a count line from (0.3, 0.4) to (0.7, 0.4)
  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.4;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.4;

  console.log('Drawing count line from', startX, startY, 'to', endX, endY);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Take screenshot to see if the line was drawn
  await canvas.screenshot({ path: 'storage/step2_drawn_line.png' });
  console.log('Screenshot saved to storage/step2_drawn_line.png');

  await browser.close();
}

testStep2Interactions().catch(console.error);
