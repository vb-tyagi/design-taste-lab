import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { validateSessionId, assertSafeUrl } from '@/lib/security';

export interface ScreenshotResult {
  filePath: string;
  absolutePath: string;
  width: number;
  height: number;
}

/**
 * Shared browser launch config that avoids headless detection.
 */
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--window-size=1440,900',
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Wait time (ms) after EVERY navigation AND scroll event.
 * Gives lazy-loaded images, JS rendering, fonts, and animations time to settle.
 */
const PAGE_SETTLE_DELAY = 10000;
const SCROLL_SETTLE_DELAY = 5000;
const POST_COOKIE_DELAY = 2000;

/**
 * UNIVERSAL PAGE LOAD SEQUENCE
 *
 * Applied every time we load a webpage, regardless of context.
 */
async function loadPage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>,
  url: string
) {
  // Realistic user agent
  await page.setUserAgent(USER_AGENT);

  // Hide webdriver flag
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Navigate
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 45000,
  });

  // Wait for initial render
  await new Promise((resolve) => setTimeout(resolve, PAGE_SETTLE_DELAY));

  // Dismiss cookie banners
  try {
    const cookieSelectors = [
      '[class*="cookie"] button[class*="accept"]',
      '[class*="cookie"] button[class*="agree"]',
      '[class*="consent"] button[class*="accept"]',
      '[id*="cookie"] button',
      'button[class*="cookie-accept"]',
      '[class*="banner"] button[class*="accept"]',
      'button[aria-label*="Accept"]',
      'button[aria-label*="accept"]',
      'button[aria-label*="cookie"]',
    ];
    for (const selector of cookieSelectors) {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        break;
      }
    }
  } catch {
    // Best-effort
  }

  await new Promise((resolve) => setTimeout(resolve, POST_COOKIE_DELAY));
}

/**
 * UNIVERSAL SCROLL-AND-WAIT SEQUENCE
 *
 * Scrolls the entire page from top to bottom in viewport-height increments,
 * waiting SCROLL_SETTLE_DELAY after each scroll to let lazy-loaded content,
 * images, animations, and JS rendering fully settle.
 *
 * Then scrolls back to the top and waits once more.
 *
 * MUST be called before any full-page screenshot to ensure ALL content
 * below the fold is loaded — not just placeholder skeletons.
 */
async function scrollEntirePage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>
) {
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  let scrolled = 0;
  while (scrolled < totalHeight) {
    await page.evaluate((y) => window.scrollTo(0, y), scrolled);
    await new Promise((resolve) => setTimeout(resolve, SCROLL_SETTLE_DELAY));
    scrolled += viewportHeight;
  }

  // Scroll back to top and wait for any scroll-triggered animations to settle
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((resolve) => setTimeout(resolve, SCROLL_SETTLE_DELAY));
}

/**
 * Captures a full-page screenshot of a URL.
 *
 * Scrolls the entire page first to trigger all lazy-loading,
 * then takes the screenshot.
 */
export async function captureScreenshot(
  url: string,
  sessionId: string
): Promise<ScreenshotResult> {
  await assertSafeUrl(url);
  if (!validateSessionId(sessionId)) throw new Error('Invalid session ID');

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', sessionId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const urlHash = Buffer.from(url).toString('base64url').slice(0, 16);
  const filename = `url-${urlHash}-${Date.now()}.png`;
  const absolutePath = path.join(uploadDir, filename);
  const relativePath = `/uploads/${sessionId}/${filename}`;

  const browser = await puppeteer.launch({
    headless: true,
    args: BROWSER_ARGS,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await loadPage(page, url);

    // Scroll the entire page to trigger ALL lazy-loaded content
    await scrollEntirePage(page);

    await page.screenshot({
      path: absolutePath,
      fullPage: true,
      type: 'png',
    });

    return {
      filePath: relativePath,
      absolutePath,
      width: 1440,
      height: 900,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Captures just the above-the-fold viewport screenshot.
 * Better for probe-style comparisons where we want a fixed viewport.
 *
 * No scrolling needed here — only captures the hero/above-fold area.
 * The 10s page settle delay is sufficient for hero content.
 */
export async function captureViewportScreenshot(
  url: string,
  sessionId: string,
  viewport: { width: number; height: number } = { width: 1440, height: 900 }
): Promise<ScreenshotResult> {
  await assertSafeUrl(url);
  if (!validateSessionId(sessionId)) throw new Error('Invalid session ID');

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', sessionId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const urlHash = Buffer.from(url).toString('base64url').slice(0, 16);
  const filename = `viewport-${urlHash}-${Date.now()}.png`;
  const absolutePath = path.join(uploadDir, filename);
  const relativePath = `/uploads/${sessionId}/${filename}`;

  const browser = await puppeteer.launch({
    headless: true,
    args: BROWSER_ARGS,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await loadPage(page, url);

    await page.screenshot({
      path: absolutePath,
      fullPage: false,
      type: 'png',
    });

    return {
      filePath: relativePath,
      absolutePath,
      width: viewport.width,
      height: viewport.height,
    };
  } finally {
    await browser.close();
  }
}
