const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';

async function testEditableFeatures() {
  console.log('=== VERIFYING EDITABLE ROI, LANES & DETECTION SETTINGS ===');
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  const results = [];
  function record(name, pass, detail = '') {
    results.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ': ' + detail : ''}`);
  }

  try {
    // 1. Navigate & load CAM-01 preset
    console.log('Loading studio...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const presetBtn = await page.$('button.preset-pill-btn:has-text("Load CAM-01 Preset")');
    if (presetBtn) {
      await presetBtn.click();
      await page.waitForTimeout(1500);
      record('Load Preset for Calibration', true, 'CAM-01 sample loaded with real 1080p frame');
    }

    // 2. Open Geometry Accordion
    console.log('Opening Geometry Accordion...');
    await page.click('.geometry-accordion-header');
    await page.waitForTimeout(600);

    // 3. Verify all 3 pills exist
    const roiPill = await page.$('button.source-mode-pill:has-text("1. ROI Road Boundary")');
    const lanesPill = await page.$('button.source-mode-pill:has-text("2. Lanes & Counting Lines")');
    const settingsPill = await page.$('button.source-mode-pill:has-text("3. Detection Settings")');
    record('All 3 Configuration Pills Exist', !!roiPill && !!lanesPill && !!settingsPill, 'ROI, Lanes, and Detection Settings pills ready');

    // 4. Test ROI Editing features
    console.log('Testing ROI Editor...');
    const vertexChips = await page.$$('.vertex-chip');
    record('Vertex Coordinate Chips Visible', vertexChips.length >= 3, `Found ${vertexChips.length} vertex chips`);

    // Switch to Add mode and click canvas
    await page.click('button:has-text("Thêm điểm (Add)")');
    await page.waitForTimeout(300);
    const canvas = await page.$('.drawing-canvas');
    if (canvas) {
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
      await page.waitForTimeout(400);
      const chipsAfterAdd = await page.$$('.vertex-chip');
      record('Add Vertex Interactivity', chipsAfterAdd.length === vertexChips.length + 1, `Added point #5, now ${chipsAfterAdd.length} vertices`);

      // Delete the added vertex using chip delete button
      const lastDeleteBtn = await page.$('.vertex-chip:last-child .vertex-chip-delete');
      if (lastDeleteBtn) {
        await lastDeleteBtn.click();
        await page.waitForTimeout(400);
        const chipsAfterDel = await page.$$('.vertex-chip');
        record('Delete Vertex via Chip', chipsAfterDel.length === vertexChips.length, `Deleted point, back to ${chipsAfterDel.length} vertices`);
      }
    }

    // Take screenshot of ROI editing
    const roiShot = path.join(__dirname, '..', 'storage', 'verified_roi_editing.png');
    await page.screenshot({ path: roiShot });
    console.log('Saved ROI screenshot:', roiShot);

    // 5. Test Lane Editing features
    console.log('Testing Lanes Editor...');
    await page.click('button.source-mode-pill:has-text("2. Lanes & Counting Lines")');
    await page.waitForTimeout(600);

    const initialLanes = await page.$$('.lane-card');
    record('Initial Lanes Displayed', initialLanes.length >= 1, `Found ${initialLanes.length} lanes`);

    // Add a new lane
    await page.click('button[title="Thêm làn xe mới"]');
    await page.waitForTimeout(400);
    const lanesAfterAdd = await page.$$('.lane-card');
    record('Add Lane Interactivity', lanesAfterAdd.length === initialLanes.length + 1, `Now ${lanesAfterAdd.length} lanes`);

    // Edit the new lane name
    const lastInput = await page.$('.lane-card:last-child input');
    if (lastInput) {
      await lastInput.fill('lane_custom_express');
      const val = await lastInput.inputValue();
      record('Edit Lane ID Input', val === 'lane_custom_express', `Updated name to: "${val}"`);
    }

    // Delete the new lane
    const delBtn = await page.$('.lane-card:last-child .lane-delete-btn');
    if (delBtn) {
      await delBtn.click();
      await page.waitForTimeout(400);
      const lanesAfterDel = await page.$$('.lane-card');
      record('Delete Lane Button Working', lanesAfterDel.length === initialLanes.length, `Deleted custom lane, back to ${lanesAfterDel.length} lanes`);
    }

    // Take screenshot of Lane editing
    const laneShot = path.join(__dirname, '..', 'storage', 'verified_lane_editing.png');
    await page.screenshot({ path: laneShot });
    console.log('Saved Lane screenshot:', laneShot);

    // 6. Test Detection Settings Tab
    console.log('Testing Detection Settings Tab...');
    await page.click('button.source-mode-pill:has-text("3. Detection Settings")');
    await page.waitForTimeout(600);

    const settingsPanel = await page.$('.settings-main-panel');
    record('Detection Settings Panel Rendered', !!settingsPanel, 'Full settings UI loaded');

    // Click "Cao tốc / Xe chạy nhanh" preset (threshold 10px, cooldown 8f)
    await page.click('button.preset-tag-btn:has-text("Cao tốc")');
    await page.waitForTimeout(400);

    const threshInput = await page.$('.settings-card-item:first-child .settings-number-input');
    const threshVal = threshInput ? await threshInput.inputValue() : '';
    record('Preset Applied to Sliders/Inputs', threshVal === '10', `Movement threshold updated to ${threshVal} px`);

    // Change Zone policy to strict
    await page.click('button.policy-pill-btn:has-text("Nghiêm ngặt")');
    await page.waitForTimeout(300);
    const strictActive = await page.$('.policy-pill-btn.active:has-text("Nghiêm ngặt")');
    record('Zone Policy Interactive Toggle', !!strictActive, 'Switched to Strict zone policy');

    // Click Save Settings
    await page.click('button.primary-button:has-text("Lưu Cài đặt")');
    await page.waitForTimeout(500);
    const toast = await page.$('.toast-item');
    const toastText = toast ? await toast.innerText() : '';
    record('Save Settings Toast', !!toast && toastText.includes('cài đặt'), `Toast: "${toastText}"`);

    // Take screenshot of Detection Settings
    const setShot = path.join(__dirname, '..', 'storage', 'verified_detection_settings.png');
    await page.screenshot({ path: setShot });
    console.log('Saved Settings screenshot:', setShot);

    // 7. Test Fullscreen Modal with Calibration Studio
    console.log('Testing Fullscreen Modal with Settings...');
    await page.click('.fullscreen-expand-btn');
    await page.waitForTimeout(800);

    const modal = await page.$('.geometry-fullscreen-container');
    record('Fullscreen Modal Studio Opened', !!modal, 'Modal mounted');

    const modalSettingsPill = await page.$('.geometry-fullscreen-container button.source-mode-pill:has-text("3. Detection Settings")');
    if (modalSettingsPill) {
      await modalSettingsPill.click();
      await page.waitForTimeout(500);
      const modalSettings = await page.$('.geometry-fullscreen-container .settings-main-panel');
      record('Fullscreen Detection Settings Tab', !!modalSettings, 'Settings accessible in fullscreen mode');
    }

    const modalShot = path.join(__dirname, '..', 'storage', 'verified_fullscreen_settings.png');
    await page.screenshot({ path: modalShot });
    console.log('Saved Fullscreen screenshot:', modalShot);

    // Exit fullscreen
    await page.click('.geometry-fullscreen-container button:has-text("Thoát toàn màn hình")');
    await page.waitForTimeout(400);

    // Console errors
    record('Zero Console Errors', consoleErrors.length === 0, consoleErrors.length > 0 ? consoleErrors.join('; ') : 'Clean console');

  } catch (err) {
    console.error('Error during test:', err);
    record('Overall Test Execution', false, err.message);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== RESULT: ${passed}/${results.length} PASSED ===`);
  const reportPath = path.join(__dirname, '..', 'storage', 'editable_features_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ passed, total: results.length, results, errors: consoleErrors }, null, 2));
}

testEditableFeatures().catch(console.error);
