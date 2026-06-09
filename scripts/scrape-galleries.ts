/**
 * Gallery Screenshot Scraper
 *
 * Scrapes existing screenshot images from design gallery websites.
 * Downloads the CDN-hosted images directly — no browser rendering needed.
 *
 * Supported sources:
 * - Minimal Gallery (minimal.gallery) — WordPress CDN
 * - SaaSFrame (saasframe.io) — Webflow CDN
 * - Land-book (land-book.com) — needs Chrome inspection for CDN pattern
 *
 * Usage:
 *   npx tsx scripts/scrape-galleries.ts [--source minimal] [--limit 50] [--category landing_saas]
 */

import fs from 'fs';
import path from 'path';
import type { LibraryScreenshot, LibraryCategory } from '../src/lib/library/types';

const LIBRARY_DIR = path.join(process.cwd(), 'public', 'library');
const MANIFEST_PATH = path.join(LIBRARY_DIR, 'manifest.json');

// ─── Helpers ─────────────────────────────────────────────

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/webp,image/avif,image/png,image/jpeg,*/*',
        'Referer': new URL(url).origin,
      },
    });
    if (!res.ok) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 5000) return false; // Skip tiny/broken images

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

function loadManifest(): LibraryScreenshot[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

function saveManifest(manifest: LibraryScreenshot[]): void {
  if (!fs.existsSync(LIBRARY_DIR)) fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

// ─── Minimal Gallery Scraper ─────────────────────────────

interface MinimalGalleryItem {
  name: string;
  url: string;
  imageUrl: string;
  category: LibraryCategory;
}

async function scrapeMinimalGallery(limit: number): Promise<MinimalGalleryItem[]> {
  console.log('  Scraping Minimal Gallery...');
  const items: MinimalGalleryItem[] = [];

  // Scrape multiple pages
  for (let page = 1; page <= Math.ceil(limit / 20); page++) {
    try {
      const pageUrl = page === 1
        ? 'https://minimal.gallery'
        : `https://minimal.gallery/page/${page}/`;

      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      });
      if (!res.ok) break;

      const html = await res.text();

      // Extract image URLs and site names from the HTML
      // Pattern: <img src="...wp-content/uploads/YEAR/MONTH/domain_-900x500.png" alt="site name">
      const imgRegex = /src="(https?:\/\/minimal\.gallery\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"]+)"/g;

      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        const imageUrl = match[1];

        // Extract the domain name from the image filename
        const filename = path.basename(imageUrl);
        const domainMatch = filename.match(/^([^_]+)_/);
        const name = domainMatch ? domainMatch[1].replace(/\./g, ' ').replace(/-/g, ' ') : `site-${items.length}`;

        items.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          url: `https://${domainMatch?.[1] || 'unknown.com'}`,
          imageUrl,
          category: 'landing_creative', // Default — can be re-tagged later
        });

        if (items.length >= limit) break;
      }

      if (items.length >= limit) break;
      console.log(`    Page ${page}: found ${items.length} total`);
    } catch (err) {
      console.error(`    Page ${page} failed:`, err);
      break;
    }
  }

  return items.slice(0, limit);
}

// ─── Main Pipeline ───────────────────────────────────────

async function scrapeAndDownload(
  source: string,
  limit: number,
  category?: LibraryCategory
) {
  let items: MinimalGalleryItem[] = [];

  switch (source) {
    case 'minimal':
      items = await scrapeMinimalGallery(limit);
      break;
    default:
      console.error(`Unknown source: ${source}. Available: minimal`);
      process.exit(1);
  }

  console.log(`\n  Found ${items.length} items. Downloading...\n`);

  const manifest = loadManifest();
  const existingUrls = new Set(manifest.map((m) => m.url));
  let downloaded = 0;
  let skipped = 0;

  for (const item of items) {
    if (existingUrls.has(item.url)) {
      skipped++;
      continue;
    }

    const cat = category || item.category;
    const slug = slugify(item.name);
    const ext = item.imageUrl.match(/\.(png|jpg|jpeg|webp|avif)/i)?.[1] || 'png';
    const imagePath = `/library/${cat}/${slug}.${ext}`;
    const absolutePath = path.join(process.cwd(), 'public', imagePath);

    process.stdout.write(`  📥 ${item.name}... `);
    const success = await downloadImage(item.imageUrl, absolutePath);

    if (success) {
      downloaded++;
      console.log('✓');

      manifest.push({
        id: `ss_${slug}`,
        url: item.url,
        name: item.name,
        category: cat,
        surface: 'marketing_landing',
        tags: {
          theme: 'light',
          density: 'breathable',
          typography: 'balanced',
          color_temp: 'neutral',
          surface_style: 'flat_modern',
          nav_style: 'minimal_topbar',
          era: '2025_trend',
          brand_tier: 'indie',
        },
        axes_hint: {},
        image_path: imagePath,
        source: source,
        captured_at: new Date().toISOString().split('T')[0],
      });
    } else {
      console.log('✗');
    }
  }

  saveManifest(manifest);

  console.log(`\n✅ Done!`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Skipped (existing): ${skipped}`);
  console.log(`   Total in manifest: ${manifest.length}\n`);
}

// ─── CLI ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const source = args.includes('--source') ? args[args.indexOf('--source') + 1] : 'minimal';
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 50;
const category = args.includes('--category') ? args[args.indexOf('--category') + 1] as LibraryCategory : undefined;

scrapeAndDownload(source, limit, category).catch(console.error);
