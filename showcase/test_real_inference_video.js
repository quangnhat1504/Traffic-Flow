const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'http://127.0.0.1:5173?console=1';

async function testRealInferenceAndVideo() {
  console.log('=== STARTING TEST: REAL INFERENCE VIDEO & TELEMETRY ===');

  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  const results = [];
  function check(name, pass, detail = '') {
    results.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  }

  try {
    // 1. Fresh page load
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // 2. Verify initial telemetry has NO default / fake mock numbers (must be 0)
    const initialTotalText = await page.$eval('.telemetry-total-number', (el) => el.textContent.trim()).catch(() => '');
    const carVal = await page.$eval('.class-counter-cell:has-text("CAR") .class-counter-value', (el) => el.textContent.trim()).catch(() => '');
    const motoVal = await page.$eval('.class-counter-cell:has-text("MOTO") .class-counter-value', (el) => el.textContent.trim()).catch(() => '');
    
    check('Initial Total is 0 (No fake 1377)', initialTotalText === '0', `Found total: "${initialTotalText}"`);
    check('Initial Cars is 0 (No fake 420)', carVal === '0', `Found cars: "${carVal}"`);
    check('Initial Moto is 0 (No fake 850)', motoVal === '0', `Found moto: "${motoVal}"`);

    // 3. Test backend Result API integrity for real task
    const apiResult = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:8000/tasks/3f0f1836-bd0f-4569-8689-c2bd03474285/result');
      return res.json();
    });

    check('Backend Result API returns real count', apiResult.total_count === 2, `total_count = ${apiResult.total_count}`);
    check('Backend Result API has video path', !!apiResult.outputs?.video_path, `video_path = ${apiResult.outputs?.video_path}`);

    // 4. Click load CAM-01 Preset to test media stage video player mounting and badge
    console.log('Testing CAM-01 demo load...');
    await page.click('button:has-text("Load CAM-01 Preset")');
    await page.waitForTimeout(2000);

    // 5. Verify video player is rendered
    const videoEl = await page.$('.studio-video-player');
    check('Video Player Mounted in Studio Media Stage', !!videoEl, 'Found .studio-video-player');

    // 6. Verify video element attributes
    const videoProps = await page.$eval('.studio-video-player', (v) => ({
      src: v.src,
      paused: v.paused,
      readyState: v.readyState,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
    })).catch((e) => ({ error: e.message }));

    console.log('Video Player DOM Properties:', videoProps);
    check('Video Source is Populated', !!videoProps.src && videoProps.src.includes('.mp4'), `src = ${videoProps.src}`);

    // 7. Verify Video Overlay Badge
    const badgeVisible = await page.$('.video-overlay-badge');
    check('Inference Video Overlay Badge Rendered', !!badgeVisible, 'Found .video-overlay-badge');

    // 8. Capture screenshot
    const screenshotDir = path.resolve(__dirname, '..', 'storage');
    const screenshotPath = path.join(screenshotDir, 'real_inference_video_verification.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);

    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} PASSED ===`);
    if (failed.length > 0) {
      console.error('FAILURES:', failed);
      process.exit(1);
    } else {
      console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error during test:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testRealInferenceAndVideo();
