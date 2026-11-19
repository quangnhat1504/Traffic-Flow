const { chromium } = require('playwright');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';
const ARTIFACT_DIR = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\3c3d2221-604b-465f-8f9e-008d2f02d3e8';

async function verifyFullscreenCalibration() {
  console.log('=== VERIFYING FULLSCREEN CALIBRATION STUDIO MODAL ===');
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
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

    // Check "Phóng to toàn màn hình" button in header
    console.log('Checking for "Phóng to toàn màn hình" trigger...');
    const fullscreenBtn = await page.waitForSelector('.fullscreen-expand-btn:has-text("Phóng to toàn màn hình")', { timeout: 5000 });
    console.log('Found Fullscreen trigger button. Clicking to open Fullscreen Modal...');
    await fullscreenBtn.click();
    await page.waitForTimeout(1000);

    // Verify modal overlay is visible
    const overlay = await page.waitForSelector('.geometry-fullscreen-overlay', { timeout: 5000 });
    console.log('Fullscreen Overlay modal mounted successfully.');

    // Measure canvas size in fullscreen mode
    const canvasDimensions = await page.$eval('.geometry-fullscreen-body .drawing-canvas', (canvas) => {
      const rect = canvas.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        canvasInternalWidth: canvas.width,
        canvasInternalHeight: canvas.height,
      };
    });
    console.log('Fullscreen Canvas Rendered Dimensions:', canvasDimensions);

    // Screenshot Step 1: ROI in Fullscreen
    const roiModalScreenshotPath = path.join(ARTIFACT_DIR, 'verified_fullscreen_roi_modal.png');
    await page.screenshot({ path: roiModalScreenshotPath, fullPage: false });
    console.log('Captured Fullscreen ROI screenshot:', roiModalScreenshotPath);

    // Switch to Step 2: Lanes & Counting Lines in Fullscreen
    console.log('Switching to Step 2: Lanes & Counting Lines in Fullscreen...');
    const lanesBtn = await page.waitForSelector('.fullscreen-step-pills button:has-text("2. Lanes & Counting Lines")', { timeout: 5000 });
    await lanesBtn.click();
    await page.waitForTimeout(1000);

    // Screenshot Step 2: Lanes in Fullscreen
    const laneModalScreenshotPath = path.join(ARTIFACT_DIR, 'verified_fullscreen_lane_modal.png');
    await page.screenshot({ path: laneModalScreenshotPath, fullPage: false });
    console.log('Captured Fullscreen Lane screenshot:', laneModalScreenshotPath);

    // Test Exit Fullscreen (Esc)
    console.log('Testing Exit Fullscreen via Exit button...');
    const exitBtn = await page.waitForSelector('.fullscreen-header-actions button:has-text("Thoát toàn màn hình")', { timeout: 5000 });
    await exitBtn.click();
    await page.waitForTimeout(800);

    // Verify modal is closed
    const overlayAfterClose = await page.$('.geometry-fullscreen-overlay');
    console.log('Overlay closed status (should be null):', overlayAfterClose === null);

    return {
      success: overlayAfterClose === null && canvasDimensions.width > 800,
      canvasDimensions,
      consoleErrors,
    };
  } finally {
    await browser.close();
  }
}

verifyFullscreenCalibration().then(result => {
  console.log('RESULT:', JSON.stringify(result, null, 2));
  process.exit(result.success && result.consoleErrors.length === 0 ? 0 : 1);
}).catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
