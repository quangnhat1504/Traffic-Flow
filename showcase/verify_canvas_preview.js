const { chromium } = require('playwright');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';
const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\3c3d2221-604b-465f-8f9e-008d2f02d3e8';

async function verifyCanvasPreview() {
  console.log('=== VISUAL VERIFICATION OF PREVIEW IMAGE ON ROI & LANE CANVAS ===');
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1600 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`Uncaught Page Error: ${err.message}`);
  });

  try {
    console.log('Navigating to studio console...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Click "Load CAM-01 Preset"
    console.log('Clicking "Load CAM-01 Preset"...');
    const presetBtn = await page.waitForSelector('button.preset-pill-btn:has-text("Load CAM-01 Preset")', { timeout: 5000 });
    await presetBtn.click();
    await page.waitForTimeout(1500);

    // Expand Geometry Accordion
    console.log('Opening Geometry & Lane Configuration accordion...');
    const accordionHeader = await page.waitForSelector('.geometry-accordion-header', { timeout: 5000 });
    await accordionHeader.scrollIntoViewIfNeeded();
    await accordionHeader.click();
    await page.waitForTimeout(1000);

    // Verify canvas is rendered
    const roiCanvas = await page.waitForSelector('.step-layout .drawing-canvas', { timeout: 5000 });
    await roiCanvas.scrollIntoViewIfNeeded();
    console.log('ROI Canvas is mounted.');

    // Screenshot Geometry section
    const geomCard = await page.$('.geometry-accordion-card');
    const roiScreenshotPath = path.join(ARTIFACT_DIR, 'verified_roi_canvas_real_image.png');
    await geomCard.screenshot({ path: roiScreenshotPath });
    console.log('Captured ROI canvas element screenshot:', roiScreenshotPath);

    // Switch to Step 2: Lanes & Counting Lines
    console.log('Switching to Step 2: Lanes & Counting Lines...');
    const lanesTab = await page.waitForSelector('button.source-mode-pill:has-text("2. Lanes & Counting Lines")', { timeout: 5000 });
    await lanesTab.click();
    await page.waitForTimeout(1000);

    // Screenshot Lane Step
    const laneScreenshotPath = path.join(ARTIFACT_DIR, 'verified_lane_canvas_real_image.png');
    await geomCard.screenshot({ path: laneScreenshotPath });
    console.log('Captured Lane canvas element screenshot:', laneScreenshotPath);

    // Full page view
    const fullScreenshotPath = path.join(ARTIFACT_DIR, 'verified_full_studio_real_image.png');
    await page.screenshot({ path: fullScreenshotPath, fullPage: true });

    return {
      success: true,
      consoleErrors,
    };
  } finally {
    await browser.close();
  }
}

verifyCanvasPreview().then(result => {
  console.log('RESULT:', JSON.stringify(result, null, 2));
  process.exit(result.consoleErrors.length === 0 ? 0 : 1);
}).catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
