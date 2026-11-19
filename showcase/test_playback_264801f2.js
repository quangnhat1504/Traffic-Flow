const { chromium } = require('./node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  });
  const page = await browser.newPage();
  
  await page.setContent(`
    <html>
      <body style="background:#111">
        <video id="v" controls autoplay muted src="http://127.0.0.1:8000/static/results/264801f2-290c-4163-9efd-876eb0627b0a.mp4"></video>
      </body>
    </html>
  `);

  await page.waitForTimeout(2000);
  const info = await page.$eval('#v', el => ({
    src: el.src,
    readyState: el.readyState,
    duration: el.duration,
    videoWidth: el.videoWidth,
    videoHeight: el.videoHeight,
    paused: el.paused,
    error: el.error ? el.error.message : null,
  }));
  console.log('Video Playback Info:', info);

  await page.screenshot({ path: 'storage/test_playback_264801f2.png' });
  console.log('Screenshot saved to storage/test_playback_264801f2.png');

  await browser.close();
})();
