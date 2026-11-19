const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://127.0.0.1:8000';

async function runButtonAudit() {
  console.log('=== Starting TrafficFlow Complete Button Audit ===');
  console.log('Browser:', EDGE_PATH);
  console.log('Target URL:', BASE_URL);

  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  const buttonAuditLog = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`Uncaught Page Error: ${err.message}`);
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[HTTP ${response.status()}] ${response.url()}`);
    }
  });

  page.on('requestfailed', request => {
    console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Helper to click a button, check error, check response
  async function testClick(selector, label, expectedOutcome = '') {
    const initialErrors = consoleErrors.length;
    let buttonFound = false;
    let clicked = false;
    let errorOccurred = null;

    try {
      const btn = await page.$(selector);
      if (btn) {
        buttonFound = true;
        const isVisible = await btn.isVisible();
        const isEnabled = await btn.isEnabled();

        if (isVisible && isEnabled) {
          await btn.click({ timeout: 3000 });
          clicked = true;
          await page.waitForTimeout(300); // Wait for state react cycle
        } else {
          errorOccurred = `Not clickable (visible=${isVisible}, enabled=${isEnabled})`;
        }
      } else {
        errorOccurred = 'Element not found on page';
      }
    } catch (e) {
      errorOccurred = e.message;
    }

    const newErrors = consoleErrors.slice(initialErrors);
    const passed = buttonFound && clicked && newErrors.length === 0;

    const result = {
      label,
      selector,
      found: buttonFound,
      clicked,
      passed,
      errors: newErrors,
      errorOccurred,
      expectedOutcome
    };

    buttonAuditLog.push(result);
    const statusStr = passed ? '[PASS]' : '[WARN]';
    console.log(`${statusStr} ${label.padEnd(35)} -> Clicked: ${clicked}, Errors: ${newErrors.length}`);
    return result;
  }

  // 1. Test Landing Page
  console.log('\n--- 1. Testing Landing Page Buttons ---');
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(500);

  await testClick('.landing-nav-cta', 'Navbar: Launch console', 'Should navigate into console');
  await page.waitForTimeout(600);

  // Return to landing page to test hero buttons
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(500);
  await testClick('.landing-hero-actions .landing-button-primary', 'Hero: Launch console', 'Should enter console');
  await page.waitForTimeout(600);

  // 2. Switch to Geometry workspace to test TopBar and Workflow navigation
  console.log('\n--- 2. Testing TopBar Buttons in Workflow (Geometry) ---');
  await testClick('.nav-item:has-text("Geometry")', 'SideNav: Geometry', 'Switch to geometry view');
  await page.waitForTimeout(400);

  await testClick('.top-steps button:has-text("Source")', 'TopBar: Source Step', 'Switch to Source step');
  await testClick('.top-steps button:has-text("ROI")', 'TopBar: ROI Step', 'Switch to ROI step');
  await testClick('.top-steps button:has-text("Lanes")', 'TopBar: Lanes Step', 'Switch to Lanes step');
  await testClick('.top-steps button:has-text("Run")', 'TopBar: Run Step', 'Switch to Run step');

  // 3. Test SideNav Navigation Items
  console.log('\n--- 3. Testing SideNav View Buttons ---');
  const navViews = [
    { text: 'Dashboard', expected: 'dashboard view' },
    { text: 'Sources', expected: 'sources view' },
    { text: 'Geometry', expected: 'geometry view' },
    { text: 'Batch Runs', expected: 'runs view' },
    { text: 'Reports', expected: 'reports view' },
    { text: 'Live Monitor', expected: 'live monitor view' },
    { text: 'System Logs', expected: 'system logs view' },
  ];

  for (const v of navViews) {
    await testClick(`.nav-item:has-text("${v.text}")`, `SideNav: ${v.text}`, v.expected);
  }

  // 4. Test Dashboard Specific Buttons
  console.log('\n--- 4. Testing Dashboard Fleet & Camera Buttons ---');
  await page.click('.nav-item:has-text("Dashboard")');
  await page.waitForTimeout(400);

  await testClick('button:has-text("Refresh data")', 'Dashboard: Refresh data', 'Refreshes stats from API');
  await testClick('.camera-option:has-text("CAM-01")', 'Camera Fleet: Select CAM-01', 'Selects CAM-01');
  await testClick('.camera-option:has-text("CAM-02")', 'Camera Fleet: Select CAM-02', 'Selects CAM-02');
  await testClick('.camera-option:has-text("CAM-03")', 'Camera Fleet: Select CAM-03', 'Selects CAM-03');

  // Test Theater / Expand modal button
  await testClick('.camera-feed-header-actions .icon-button', 'Camera Feed: Theater / Expand', 'Opens theater modal');
  await page.waitForTimeout(300);
  const modalClose = await page.$('.camera-expand-header button');
  if (modalClose) {
    await testClick('.camera-expand-header button', 'Theater Modal: Close', 'Closes theater modal');
  }

  // Test Load to Workspace
  await testClick('button:has-text("Load CAM-03 to Workspace")', 'Fleet: Load CAM-03 to Workspace', 'Loads into Geometry workspace');
  await page.waitForTimeout(500);

  // 5. Test Geometry Workspace Buttons
  console.log('\n--- 5. Testing Geometry Workspace Buttons ---');
  // Check Wizard Navigation buttons
  await testClick('.wizard-step:has-text("Source")', 'WizardNav: 01 Source', 'Navigates to Source');
  await testClick('.wizard-step:has-text("ROI")', 'WizardNav: 02 ROI', 'Navigates to ROI');
  await testClick('.wizard-step:has-text("Lanes")', 'WizardNav: 03 Lanes', 'Navigates to Lanes');
  await testClick('.wizard-step:has-text("Run")', 'WizardNav: 04 Run', 'Navigates to Run');

  // Switch to geometry
  await page.click('.nav-item:has-text("Geometry")');
  await page.waitForTimeout(400);

  // Check buttons on tool panel if present
  const addLaneBtn = await page.$('button:has-text("Add Lane"), button:has-text("Add lane")');
  if (addLaneBtn) {
    await testClick('button:has-text("Add Lane"), button:has-text("Add lane")', 'Geometry: Add Lane', 'Adds new lane');
  }
  const resetRoiBtn = await page.$('button:has-text("Reset ROI"), button:has-text("Clear")');
  if (resetRoiBtn) {
    await testClick('button:has-text("Reset ROI"), button:has-text("Clear")', 'Geometry: Reset/Clear', 'Resets geometry');
  }

  // 6. Test Sources Intake Buttons
  console.log('\n--- 6. Testing Sources Intake Buttons ---');
  await page.click('.nav-item:has-text("Sources")');
  await page.waitForTimeout(400);

  await testClick('.source-tabs button:has-text("Live stream")', 'Sources: Live stream tab', 'Switches to live tab');
  await testClick('.source-tabs button:has-text("Recorded video")', 'Sources: Recorded video tab', 'Switches to upload tab');

  // Check preset fast track button
  const presetBtn = await page.$('button:has-text("Use Sample CAM-01"), button:has-text("Sample")');
  if (presetBtn) {
    await testClick('button:has-text("Use Sample CAM-01"), button:has-text("Sample")', 'Sources: Sample Video Preset', 'Loads sample video');
  }

  // 7. Test Reports Page Buttons
  console.log('\n--- 7. Testing Reports Page Buttons ---');
  await page.click('.nav-item:has-text("Reports")');
  await page.waitForTimeout(400);

  await testClick('button:has-text("Export Sample Fleet Report")', 'Reports: Export Sample Fleet Report', 'Downloads sample report');
  await testClick('button:has-text("Start a run")', 'Reports: Start a run', 'Navigates to source intake');

  // 8. Test System Logs & JSON inspection
  console.log('\n--- 8. Testing System Logs Buttons ---');
  await page.click('.nav-item:has-text("System Logs")');
  await page.waitForTimeout(400);

  // 9. Test TopBar Overview / Return to Landing
  console.log('\n--- 9. Testing Return to Landing ---');
  await testClick('.console-home-button:has-text("Overview")', 'TopBar: Overview / Exit', 'Return to landing');
  await page.waitForTimeout(400);

  // Capture final screenshot of tested system
  const finalScreenshot = path.join(__dirname, '..', 'storage', 'button_audit_screen.png');
  await page.screenshot({ path: finalScreenshot, fullPage: true });

  await browser.close();

  const totalTested = buttonAuditLog.length;
  const totalPassed = buttonAuditLog.filter(b => b.passed).length;
  const totalFailed = totalTested - totalPassed;

  console.log('\n==========================================');
  console.log(`Button Audit Complete:`);
  console.log(`Total Buttons Tested: ${totalTested}`);
  console.log(`Successfully Clicked & Responsive: ${totalPassed}/${totalTested}`);
  console.log(`Console Errors During Audit: ${consoleErrors.length}`);
  console.log('==========================================');

  fs.writeFileSync(
    path.join(__dirname, '..', 'storage', 'button_audit_results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { total: totalTested, passed: totalPassed, failed: totalFailed, consoleErrors: consoleErrors.length },
      errors: consoleErrors,
      buttons: buttonAuditLog
    }, null, 2)
  );
  console.log('Saved button audit results to storage/button_audit_results.json');
}

runButtonAudit().catch(err => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
