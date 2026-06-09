/**
 * Library Capture Script
 *
 * Captures screenshots for all seed URLs and generates the library manifest.
 *
 * Usage:
 *   npx tsx scripts/capture-library.ts [--category landing_saas] [--limit 10] [--resume]
 *
 * Options:
 *   --category  Only capture a specific category
 *   --limit     Limit number of captures (for testing)
 *   --resume    Skip URLs that already have screenshots
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { ALL_SEED_URLS } from '../src/lib/library/seed-urls';
import type { LibraryScreenshot } from '../src/lib/library/types';

const LIBRARY_DIR = path.join(process.cwd(), 'public', 'library');
const MANIFEST_PATH = path.join(LIBRARY_DIR, 'manifest.json');

const VIEWPORT = { width: 1440, height: 900 };
const WAIT_MS = 10000; // 10 seconds for page load
const BATCH_SIZE = 3;  // Concurrent captures

// Cookie banner selectors to auto-dismiss
const COOKIE_SELECTORS = [
  '[class*="cookie"] button',
  '[class*="consent"] button',
  '[id*="cookie"] button',
  '[class*="banner"] button[class*="accept"]',
  'button[data-testid*="cookie"]',
  'button[data-testid*="accept"]',
];

async function captureScreenshot(
  browser: puppeteer.Browser,
  url: string,
  outputPath: string
): Promise<boolean> {
  const page = await browser.newPage();

  try {
    // Anti-detection
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport(VIEWPORT);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, WAIT_MS));

    // Try to dismiss cookie banners
    for (const selector of COOKIE_SELECTORS) {
      try {
        const btn = await page.$(selector);
        if (btn) { await btn.click(); await new Promise((r) => setTimeout(r, 1000)); break; }
      } catch {}
    }

    // Wait a bit more after cookie dismissal
    await new Promise((r) => setTimeout(r, 2000));

    await page.screenshot({
      path: outputPath,
      fullPage: false, // Viewport only — above the fold
      type: 'png',
    });

    return true;
  } catch (err) {
    console.error(`  ✗ Failed: ${url} — ${err instanceof Error ? err.message : 'unknown'}`);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
  const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
  const resume = args.includes('--resume');

  // Filter seeds
  let seeds = categoryFilter
    ? ALL_SEED_URLS.filter((s) => s.category === categoryFilter)
    : ALL_SEED_URLS;

  if (limitArg < seeds.length) {
    seeds = seeds.slice(0, limitArg);
  }

  console.log(`\n📸 Capturing ${seeds.length} screenshots...\n`);

  // Ensure category directories exist
  const categories = [...new Set(seeds.map((s) => s.category))];
  for (const cat of categories) {
    const dir = path.join(LIBRARY_DIR, cat);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing manifest
  let manifest: LibraryScreenshot[] = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let captured = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < seeds.length; i += BATCH_SIZE) {
    const batch = seeds.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (seed) => {
        const slug = seed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        const imagePath = `/library/${seed.category}/${slug}.png`;
        const absolutePath = path.join(process.cwd(), 'public', imagePath);

        // Skip if already captured and resuming
        if (resume && fs.existsSync(absolutePath)) {
          skipped++;
          return;
        }

        console.log(`  📷 ${seed.name} (${seed.url})`);
        const success = await captureScreenshot(browser, seed.url, absolutePath);

        if (success) {
          captured++;

          // Add to manifest (or update existing)
          const entry: LibraryScreenshot = {
            id: `ss_${slug}`,
            url: seed.url,
            name: seed.name,
            category: seed.category,
            surface: seed.surface,
            tags: seed.tags,
            axes_hint: seed.axes_hint || {},
            image_path: imagePath,
            source: 'puppeteer',
            captured_at: new Date().toISOString().split('T')[0],
          };

          // Replace if exists, otherwise add
          const existingIdx = manifest.findIndex((m) => m.url === seed.url);
          if (existingIdx >= 0) {
            manifest[existingIdx] = entry;
          } else {
            manifest.push(entry);
          }
        } else {
          failed++;
        }
      })
    );

    // Save manifest after each batch (crash-safe)
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    // Progress
    const total = Math.min(i + BATCH_SIZE, seeds.length);
    console.log(`  → Progress: ${total}/${seeds.length} (${captured} captured, ${skipped} skipped, ${failed} failed)\n`);
  }

  await browser.close();

  console.log(`\n✅ Done!`);
  console.log(`   Captured: ${captured}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total in manifest: ${manifest.length}`);
  console.log(`   Manifest: ${MANIFEST_PATH}\n`);
}

main().catch(console.error);
