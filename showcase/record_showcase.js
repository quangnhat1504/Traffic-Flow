/**
 * Playwright Automated Video Capture for TrafficFlow Showcase
 * ============================================================
 * Implements:
 * - 1920x1080 Viewport at 60fps video capture
 * - Zero-Latency Virtual Cursor with Click Ripple Animation
 * - Natural human mouse curves and realistic pacing
 * - Full walkthrough of Landing -> Console Dashboard -> Camera Fleet -> Sources -> Geometry -> Logs
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, 'raw');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function injectVirtualCursor(page) {
  await page.evaluate(() => {
    // Clean up existing if any
    const oldC = document.getElementById('tf-virtual-cursor');
    if (oldC) oldC.remove();

    // Virtual cursor element
    const cursor = document.createElement('div');
    cursor.id = 'tf-virtual-cursor';
    cursor.style.position = 'fixed';
    cursor.style.width = '24px';
    cursor.style.height = '24px';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '9999999';
    cursor.style.transition = 'none'; // CRITICAL: zero-latency sync
    cursor.style.transform = 'translate(-2px, -2px)';
    cursor.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 2L20 11L13 13L11 20L4 2Z" fill="#00F2FE" stroke="#05070E" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;
    document.body.appendChild(cursor);

    // Ripple click element
    const ripple = document.createElement('div');
    ripple.id = 'tf-cursor-ripple';
    ripple.style.position = 'fixed';
    ripple.style.width = '36px';
    ripple.style.height = '36px';
    ripple.style.borderRadius = '50%';
    ripple.style.border = '2px solid #00F2FE';
    ripple.style.pointerEvents = 'none';
    ripple.style.zIndex = '9999998';
    ripple.style.opacity = '0';
    ripple.style.transform = 'translate(-50%, -50%) scale(0.5)';
    ripple.style.transition = 'transform 0.35s ease-out, opacity 0.35s ease-out';
    document.body.appendChild(ripple);

    window.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });

    window.addEventListener('mousedown', (e) => {
      ripple.style.left = e.clientX + 'px';
      ripple.style.top = e.clientY + 'px';
      ripple.style.transition = 'none';
      ripple.style.transform = 'translate(-50%, -50%) scale(0.3)';
      ripple.style.opacity = '0.95';

      requestAnimationFrame(() => {
        ripple.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease-out';
        ripple.style.transform = 'translate(-50%, -50%) scale(2.0)';
        ripple.style.opacity = '0';
      });
    });
  });
}

// Cubic bezier smoothing for natural human cursor trajectory
async function smoothMove(page, targetX, targetY, steps = 24) {
  const currentPos = await page.evaluate(() => {
    const c = document.getElementById('tf-virtual-cursor');
    if (!c) return { x: 960, y: 540 };
    return { x: parseFloat(c.style.left) || 960, y: parseFloat(c.style.top) || 540 };
  });

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const x = currentPos.x + (targetX - currentPos.x) * ease;
    const y = currentPos.y + (targetY - currentPos.y) * ease;
    await page.mouse.move(x, y);
    await new Promise((r) => setTimeout(r, 16)); // ~60fps step
  }
}

async function naturalClick(page, targetX, targetY) {
  await smoothMove(page, targetX, targetY);
  await new Promise((r) => setTimeout(r, 200)); // Deliberate hover pause
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 90));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 220));
}

(async () => {
  console.log('[*] Launching Chrome 1920x1080 Viewport...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--disable-features=Translate', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1.0,
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  console.log('[*] Navigating to http://127.0.0.1:8000 ...');
  await page.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle' });
  await injectVirtualCursor(page);
  await new Promise((r) => setTimeout(r, 1200));

  // ─────────────────────────────────────────────────────────────
  // ACT 1: Landing Page Hero & CLICK INTO CONSOLE
  // ─────────────────────────────────────────────────────────────
  console.log('[*] Act 1: Landing Page Hero & Launch Console...');
  await smoothMove(page, 960, 400);
  await new Promise((r) => setTimeout(r, 1200));

  // Find the exact "Launch console" button
  const launchBtn = page.locator('button:has-text("Launch console")').first();
  const launchBox = await launchBtn.boundingBox();
  if (launchBox) {
    console.log(`[+] Clicking Launch Console at (${launchBox.x}, ${launchBox.y})`);
    await naturalClick(page, launchBox.x + launchBox.width / 2, launchBox.y + launchBox.height / 2);
  } else {
    console.log('[!] Launch console button not found by text, trying class selector');
    const altBtn = page.locator('.landing-button-primary').first();
    const altBox = await altBtn.boundingBox();
    if (altBox) {
      await naturalClick(page, altBox.x + altBox.width / 2, altBox.y + altBox.height / 2);
    }
  }

  // Re-inject virtual cursor in case page transitioned
  await new Promise((r) => setTimeout(r, 1000));
  await injectVirtualCursor(page);
  await new Promise((r) => setTimeout(r, 1500));

  // ─────────────────────────────────────────────────────────────
  // ACT 2: CONSOLE DASHBOARD & CAMERA FLEET INSPECTION
  // ─────────────────────────────────────────────────────────────
  console.log('[*] Act 2: Inside Console — Inspecting Camera Fleet...');
  const cameraOptions = page.locator('.camera-option');
  const camCount = await cameraOptions.count().catch(() => 0);
  console.log(`[+] Found ${camCount} camera options in Fleet`);

  if (camCount > 0) {
    // Click Cam 01
    const box1 = await cameraOptions.nth(0).boundingBox();
    if (box1) {
      console.log('  -> Selecting Camera 01 (North Gate)');
      await naturalClick(page, box1.x + box1.width / 2, box1.y + box1.height / 2);
      await new Promise((r) => setTimeout(r, 1800));
    }

    // Click Cam 02
    if (camCount > 1) {
      const box2 = await cameraOptions.nth(1).boundingBox();
      if (box2) {
        console.log('  -> Selecting Camera 02 (Riverside)');
        await naturalClick(page, box2.x + box2.width / 2, box2.y + box2.height / 2);
        await new Promise((r) => setTimeout(r, 1800));
      }
    }

    // Click Cam 03
    if (camCount > 2) {
      const box3 = await cameraOptions.nth(2).boundingBox();
      if (box3) {
        console.log('  -> Selecting Camera 03 (Downtown East)');
        await naturalClick(page, box3.x + box3.width / 2, box3.y + box3.height / 2);
        await new Promise((r) => setTimeout(r, 1800));
      }
    }
  }

  // Smooth scroll down to telemetry volume charts
  console.log('[*] Scrolling to Telemetry & Volume Charts...');
  await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' }));
  await new Promise((r) => setTimeout(r, 2200));

  // Hover over volume / direction stats
  await smoothMove(page, 720, 680);
  await new Promise((r) => setTimeout(r, 1000));
  await smoothMove(page, 1200, 680);
  await new Promise((r) => setTimeout(r, 1200));

  // Scroll back to top
  await page.evaluate(() => window.scrollBy({ top: -380, behavior: 'smooth' }));
  await new Promise((r) => setTimeout(r, 1200));

  // ─────────────────────────────────────────────────────────────
  // ACT 3: SOURCES / INGEST WORKSPACE
  // ─────────────────────────────────────────────────────────────
  console.log('[*] Act 3: Opening Sources Workspace...');
  const sourcesNav = page.locator('button:has-text("Sources"), .nav-item:has-text("Sources")').first();
  const sourcesBox = await sourcesNav.boundingBox();
  if (sourcesBox) {
    await naturalClick(page, sourcesBox.x + sourcesBox.width / 2, sourcesBox.y + sourcesBox.height / 2);
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Hover over upload dropzone & URL input
  await smoothMove(page, 960, 480);
  await new Promise((r) => setTimeout(r, 1500));

  // ─────────────────────────────────────────────────────────────
  // ACT 4: GEOMETRY WORKSPACE & CANVAS INTERACTION
  // ─────────────────────────────────────────────────────────────
  console.log('[*] Act 4: Opening Geometry Workspace...');
  const geometryNav = page.locator('button:has-text("Geometry"), .nav-item:has-text("Geometry")').first();
  const geometryBox = await geometryNav.boundingBox();
  if (geometryBox) {
    await naturalClick(page, geometryBox.x + geometryBox.width / 2, geometryBox.y + geometryBox.height / 2);
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Simulate geometric road area examination
  await smoothMove(page, 620, 440);
  await new Promise((r) => setTimeout(r, 600));
  await smoothMove(page, 860, 380);
  await new Promise((r) => setTimeout(r, 600));
  await smoothMove(page, 1100, 520);
  await new Promise((r) => setTimeout(r, 600));
  await smoothMove(page, 800, 580);
  await new Promise((r) => setTimeout(r, 1200));

  // ─────────────────────────────────────────────────────────────
  // ACT 5: SYSTEM LOGS & DIAGNOSTICS
  // ─────────────────────────────────────────────────────────────
  console.log('[*] Act 5: Opening System Logs...');
  const logsNav = page.locator('button:has-text("System Logs"), .nav-item:has-text("System Logs")').first();
  const logsBox = await logsNav.boundingBox();
  if (logsBox) {
    await naturalClick(page, logsBox.x + logsBox.width / 2, logsBox.y + logsBox.height / 2);
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Return to Dashboard Home for final hero shot
  console.log('[*] Returning to Dashboard Home...');
  const dashNav = page.locator('button:has-text("Dashboard"), .nav-item:has-text("Dashboard")').first();
  const dashBox = await dashNav.boundingBox();
  if (dashBox) {
    await naturalClick(page, dashBox.x + dashBox.width / 2, dashBox.y + dashBox.height / 2);
    await new Promise((r) => setTimeout(r, 2000));
  }

  await smoothMove(page, 960, 540);
  await new Promise((r) => setTimeout(r, 1800));

  console.log('[*] Closing context & saving video...');
  await page.close();
  await context.close();
  await browser.close();
  console.log('[+] Browser session recording completed.');
})();
