const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';

async function runStudioVerification() {
  console.log('=== STARTING 2-COLUMN STITCH STUDIO VERIFICATION ===');
  console.log('Target URL:', TARGET_URL);

  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
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

  const verificationResults = [];

  function record(testName, passed, details = '') {
    verificationResults.push({ testName, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testName}${details ? ': ' + details : ''}`);
  }

  try {
    // 1. Load console studio page
    console.log('Navigating to console studio...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // 2. Verify SideNav is eliminated
    const sideNavVisible = await page.$eval('.side-nav', (el) => window.getComputedStyle(el).display !== 'none').catch(() => false);
    record('SideNav Completely Eliminated', !sideNavVisible, 'SideNav display is none/removed');

    // 3. Verify 2-Column Split Layout Structure (Left: Video & Player, Right: Progress & Telemetry)
    const splitLayoutExists = await page.$('.studio-split-layout');
    record('2-Column Split Grid Exists', !!splitLayoutExists, 'Found .studio-split-layout container');

    const leftCol = await page.$('.studio-left-col');
    const rightCol = await page.$('.studio-right-col');
    record('Left & Right Columns Present', !!leftCol && !!rightCol, 'Found both .studio-left-col and .studio-right-col');

    // 4. Verify Left Column components (Intake Card + Media Stage)
    const intakeBox = await page.$('.studio-source-card');
    const mediaStage = await page.$('.studio-media-stage');
    record('Left Column: Intake & 16:9 Display Stage', !!intakeBox && !!mediaStage, 'Found intake box and 16:9 media display stage on left');

    // 5. Verify Right Column components (Progress Card + Telemetry Counters + Export Toolbar)
    const progressCard = await page.$('.progress-card');
    const pipelineTrack = await page.$('.pipeline-steps-track');
    const telemetryCard = await page.$('.telemetry-dashboard-card');
    const exportCard = await page.$('.instant-export-card');
    record('Right Column: Progress, Telemetry & Export', !!progressCard && !!pipelineTrack && !!telemetryCard && !!exportCard, 'Found progress card, step track, telemetry, and export card on right');

    // 6. Verify Mode Switcher Pills exist (Upload Video & Stream RTSP / YouTube)
    const uploadPill = await page.$('button.source-mode-pill:has-text("Upload Video")');
    const livePill = await page.$('button.source-mode-pill:has-text("Stream RTSP / YouTube")');
    record('Mode Switcher Pills Exist', !!uploadPill && !!livePill, 'Found both Upload Video & Stream RTSP / YouTube');

    // 7. Test Quick Demo: Click "Load CAM-01 Preset"
    console.log('Clicking "Load CAM-01 Preset"...');
    const presetBtn = await page.$('button.preset-pill-btn:has-text("Load CAM-01 Preset")');
    if (presetBtn) {
      await presetBtn.click();
      await page.waitForTimeout(1500);

      // Verify Telemetry counters updated
      const totalVehiclesText = await page.$eval('.telemetry-total-number', (el) => el.textContent.trim()).catch(() => '');
      record('CAM-01 Preset Loaded Telemetry Total', totalVehiclesText === '16', `Total vehicles counter: ${totalVehiclesText}`);

      const carCount = await page.$eval('.class-counter-cell:has-text("Cars") .class-counter-value', (el) => el.textContent.trim()).catch(() => '');
      record('Vehicle Class Breakdown Populated (Cars)', carCount === '3', `Cars: ${carCount}`);

      // Verify Video stage playing
      const videoElement = await page.$('.studio-video-player');
      record('Annotated Video Stage Loaded', !!videoElement, 'Video player mounted with CAM-01 output');

      // Verify Progress Card shows 100%
      const progressValue = await page.$eval('.progress-bar-header strong', (el) => el.textContent.trim()).catch(() => '');
      record('Pipeline Progress Tracked', progressValue === '100%', `Progress bar reads: ${progressValue}`);
    } else {
      record('Load CAM-01 Preset Button', false, 'Button not found');
    }

    // 8. Test Instant Data Export: Export JSON
    console.log('Testing "Export JSON"...');
    const [downloadJson] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.click('button:has-text("Export JSON")'),
    ]);

    if (downloadJson) {
      const suggestedFilename = downloadJson.suggestedFilename();
      const downloadPath = path.join(__dirname, '..', 'storage', suggestedFilename);
      await downloadJson.saveAs(downloadPath);
      const fileContent = fs.readFileSync(downloadPath, 'utf8');
      const parsedJson = JSON.parse(fileContent);
      const isValidSnapshot = parsedJson.export_type === 'instant_telemetry_snapshot' && parsedJson.analytics?.total_vehicles > 0;
      record('Instant JSON Snapshot Export', isValidSnapshot, `Downloaded ${suggestedFilename} (${fileContent.length} bytes, total: ${parsedJson.analytics?.total_vehicles})`);
    } else {
      record('Instant JSON Snapshot Export', false, 'Download event did not fire');
    }

    // 9. Test Instant Data Export: Export CSV
    console.log('Testing "Export CSV"...');
    const [downloadCsv] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.click('button:has-text("Export CSV")'),
    ]);

    if (downloadCsv) {
      const suggestedCsv = downloadCsv.suggestedFilename();
      const downloadCsvPath = path.join(__dirname, '..', 'storage', suggestedCsv);
      await downloadCsv.saveAs(downloadCsvPath);
      const csvContent = fs.readFileSync(downloadCsvPath, 'utf8');
      const isValidCsv = csvContent.includes('VEHICLE CLASS BREAKDOWN') && csvContent.includes('total_vehicles');
      record('Instant CSV Export', isValidCsv, `Downloaded ${suggestedCsv} (${csvContent.length} bytes)`);
    } else {
      record('Instant CSV Export', false, 'CSV Download event did not fire');
    }

    // 10. Test "Copy Clipboard" & Toast notification
    console.log('Testing "Copy Clipboard"...');
    await page.click('button:has-text("Copy Clipboard")');
    await page.waitForTimeout(500);
    const toast = await page.$('.toast-item');
    const toastText = toast ? await toast.innerText() : '';
    record('Copy Clipboard & Toast Notification', !!toast && toastText.includes('Snapshot'), `Toast message: "${toastText}"`);

    // 11. Test "Inspect Raw" JSON Modal
    console.log('Testing "Inspect Raw"...');
    await page.click('button:has-text("Inspect Raw")');
    await page.waitForTimeout(500);
    const jsonModal = await page.$('.json-modal');
    record('Inspect Raw JSON Modal Opened', !!jsonModal, 'Modal visible with formatted JSON payload');

    // Close modal
    if (jsonModal) {
      await page.click('.json-modal .icon-button');
      await page.waitForTimeout(300);
    }

    // 12. Test Switching to RTSP / YouTube Live mode
    console.log('Testing switch to "Stream RTSP / YouTube"...');
    await page.click('button.source-mode-pill:has-text("Stream RTSP / YouTube")');
    await page.waitForTimeout(500);

    const liveInput = await page.$('.studio-live-input');
    const resolveBtn = await page.$('button:has-text("Resolve")');
    record('RTSP / YouTube Mode Intake Form', !!liveInput && !!resolveBtn, 'Stream URL input and Resolve button ready');

    // Test typing a stream URL
    if (liveInput) {
      await liveInput.fill('https://www.youtube.com/watch?v=1Ej_qD0eH4k');
      const inputVal = await liveInput.inputValue();
      record('Stream URL Input Typing', inputVal.includes('youtube.com'), 'Typed stream URL');
    }

    // 13. Test Geometry Accordion Expand / Collapse
    console.log('Testing Geometry Accordion...');
    await page.click('.geometry-accordion-header');
    await page.waitForTimeout(500);
    const accordionBody = await page.$('.geometry-accordion-body');
    record('Geometry Accordion Expand', !!accordionBody, 'Accordion expanded displaying calibration tools');

    // Switch back to Video mode for clean screenshot
    await page.click('button.source-mode-pill:has-text("Upload Video")');
    await page.waitForTimeout(500);

    // Scroll to top and capture pristine screenshots
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const viewportScreenshotPath = path.join(__dirname, '..', 'storage', 'stitch_split_studio_viewport.png');
    await page.screenshot({ path: viewportScreenshotPath, fullPage: false });
    console.log(`Saved viewport screenshot to: ${viewportScreenshotPath}`);

    const screenshotPath = path.join(__dirname, '..', 'storage', 'stitch_split_studio_full.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved fullpage screenshot to: ${screenshotPath}`);

    // Verify 0 console errors
    record('Zero Console Errors', consoleErrors.length === 0, consoleErrors.length > 0 ? consoleErrors.join('; ') : 'Clean console with 0 errors');

  } catch (err) {
    console.error('Test execution error:', err);
    record('Overall Test Execution', false, err.message);
  } finally {
    await browser.close();
  }

  // Save verification report
  const reportPath = path.join(__dirname, '..', 'storage', 'stitch_split_studio_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total_tests: verificationResults.length,
    passed_tests: verificationResults.filter((r) => r.passed).length,
    results: verificationResults,
    console_errors: consoleErrors,
  }, null, 2));

  console.log(`\nVerification Complete! Passed ${verificationResults.filter((r) => r.passed).length}/${verificationResults.length}`);
}

runStudioVerification().catch(console.error);
