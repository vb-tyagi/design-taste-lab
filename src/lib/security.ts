/**
 * Security utilities — shared across all API routes and services.
 *
 * Fixes: CRIT-3 (path traversal), HIGH-2 (file validation), HIGH-7 (EXIF)
 */

import path from 'path';
import dns from 'dns/promises';
import net from 'net';

/**
 * CRIT-3 FIX: Validate sessionId format.
 *
 * Session IDs are nanoid(21) — only alphanumeric + hyphen + underscore.
 * Rejects any sessionId that could cause path traversal (../, etc).
 */
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{10,30}$/;

export function validateSessionId(sessionId: string): boolean {
  return SESSION_ID_REGEX.test(sessionId);
}

/**
 * CRIT-3 FIX: Resolve a path and assert it's within the expected base directory.
 *
 * Prevents directory traversal even if the regex is bypassed.
 */
export function safePath(baseDir: string, ...segments: string[]): string {
  const resolved = path.resolve(baseDir, ...segments);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

/**
 * HIGH-2 FIX: Server-side file validation.
 *
 * Validates file type (MIME + extension), file size, and file count.
 */
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_REQUEST = 20;
const MAX_REFS_PER_SESSION = 50;

export interface FileValidationError {
  filename: string;
  error: string;
}

export function validateUploadedFiles(
  files: File[],
  existingRefCount = 0
): { valid: File[]; errors: FileValidationError[] } {
  const errors: FileValidationError[] = [];
  const valid: File[] = [];

  // Check total count
  if (files.length > MAX_FILES_PER_REQUEST) {
    return {
      valid: [],
      errors: [{ filename: '*', error: `Too many files. Max ${MAX_FILES_PER_REQUEST} per upload.` }],
    };
  }

  if (existingRefCount + files.length > MAX_REFS_PER_SESSION) {
    return {
      valid: [],
      errors: [{ filename: '*', error: `Session limit: max ${MAX_REFS_PER_SESSION} total references.` }],
    };
  }

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    // Check extension
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push({ filename: file.name, error: `Invalid file type: ${ext}. Allowed: PNG, JPG, WebP, GIF.` });
      continue;
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      errors.push({ filename: file.name, error: `Invalid MIME type: ${file.type}.` });
      continue;
    }

    // Check size
    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        filename: file.name,
        error: `Too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB.`,
      });
      continue;
    }

    valid.push(file);
  }

  return { valid, errors };
}

/**
 * HIGH-7 FIX: Strip EXIF metadata from image buffer using sharp.
 *
 * sharp is already a transitive dependency via Next.js.
 * .rotate() applies auto-orientation from EXIF, and by default sharp strips all metadata.
 */
export async function stripExif(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer).rotate().toBuffer();
  } catch (err) {
    // If sharp fails (e.g. unsupported format), return original buffer but warn
    console.warn(`stripExif: failed to process image — ${err instanceof Error ? err.message : String(err)}`);
    return buffer;
  }
}

/**
 * SSRF FIX: Single canonical guard for any user-supplied URL we fetch/navigate.
 *
 * This is the ONE validator both URL-ingestion paths must use
 * (`/api/references/url` and `steal-from-url` → screenshot service), so they
 * can't drift apart. Unlike a string-match check, it DNS-resolves the hostname
 * and rejects if ANY resolved address is private/internal, covering both IPv4
 * and IPv6. It fails closed: anything it can't positively classify as public
 * is rejected.
 *
 * Known residual risk (accepted for the current local/single-user threat model):
 * DNS-rebinding TOCTOU and HTTP-redirect-following — Puppeteer re-resolves the
 * hostname and follows 3xx redirects AFTER this check. Before a public/
 * multi-tenant deploy, pin the validated IP (e.g. Puppeteer
 * `--host-resolver-rules`) and re-validate each navigation hop.
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '::', '[::]']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // not a clean dotted-quad → fail closed
  }
  const [a, b] = parts;
  return (
    a === 0 || // "this" network
    a === 10 || // 10.0.0.0/8 private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (incl. 169.254.169.254 cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    a >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP → fail closed
}

export interface SafeUrlOptions {
  /** When true, only `https:` is accepted (default allows `http:` and `https:`). */
  httpsOnly?: boolean;
}

/**
 * Validate a user-supplied URL against SSRF. Returns the parsed, normalized URL
 * on success; throws an Error with a user-safe message otherwise.
 */
export async function assertSafeUrl(
  rawUrl: string,
  opts: SafeUrlOptions = {}
): Promise<URL> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Invalid URL');
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Invalid URL');
  }

  // Scheme allowlist — blocks file:, javascript:, data:, gopher:, etc.
  if (opts.httpsOnly) {
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }
  } else if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) URLs are allowed');
  }

  // Normalize hostname (strip IPv6 brackets).
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('Internal URLs are not allowed');
  }

  // Literal IP — check directly, no DNS needed.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Internal/private IP URLs are not allowed');
    }
    return parsed;
  }

  // Hostname — resolve ALL addresses and reject if any is private.
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve hostname');
  }
  if (addresses.length === 0) {
    throw new Error('Could not resolve hostname');
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error('Internal/private IP URLs are not allowed');
    }
  }

  return parsed;
}
