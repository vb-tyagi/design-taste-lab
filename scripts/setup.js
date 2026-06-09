#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Design Taste Lab — First-run setup script
 *
 * Usage: npm run setup
 *
 * What it does:
 * 1. Copies .env.example → .env.local (if not exists)
 * 2. Creates data/ directory for SQLite
 * 3. Creates public/uploads/ directory
 * 4. Creates public/demo/ directory
 * 5. Runs database migrations
 * 6. Prints a helpful "you're ready" message
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg) { console.log(msg); }
function success(msg) { console.log(`${GREEN}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }
function info(msg) { console.log(`${CYAN}→${RESET} ${msg}`); }

log('');
log(`${BOLD}🎯 Design Taste Lab — Setup${RESET}`);
log(`${DIM}${'─'.repeat(40)}${RESET}`);
log('');

// 1. Copy .env.example → .env.local
const envExample = path.join(ROOT, '.env.example');
const envLocal = path.join(ROOT, '.env.local');

if (fs.existsSync(envLocal)) {
  warn('.env.local already exists — skipping copy');
} else {
  fs.copyFileSync(envExample, envLocal);
  success('Created .env.local from .env.example');
}

// 2. Create data/ directory
const dataDir = path.join(ROOT, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  success('Created data/ directory');
} else {
  success('data/ directory exists');
}

// 3. Create public/uploads/ directory
const uploadsDir = path.join(ROOT, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  success('Created public/uploads/ directory');
} else {
  success('public/uploads/ directory exists');
}

// 4. Create public/demo/ directory
const demoDir = path.join(ROOT, 'public', 'demo');
if (!fs.existsSync(demoDir)) {
  fs.mkdirSync(demoDir, { recursive: true });
  success('Created public/demo/ directory');
} else {
  success('public/demo/ directory exists');
}

// 5. Run database migrations
log('');
info('Running database setup...');
try {
  execSync('npx drizzle-kit push', {
    cwd: ROOT,
    stdio: 'pipe',
  });
  success('Database schema applied');
} catch {
  warn('Database setup failed — you can run it manually with: npm run db:push');
}

// 6. Done!
log('');
log(`${DIM}${'─'.repeat(40)}${RESET}`);
log('');
log(`${GREEN}${BOLD}✅ Setup complete!${RESET}`);
log('');

// Check if API key is configured
const envContent = fs.readFileSync(envLocal, 'utf-8');
const hasAnthropicKey = envContent.includes('ANTHROPIC_API_KEY=') &&
  !envContent.match(/ANTHROPIC_API_KEY=\s*$/m) &&
  !envContent.match(/ANTHROPIC_API_KEY=\s*#/m);

if (hasAnthropicKey) {
  log(`${BOLD}Next steps:${RESET}`);
  log(`  ${CYAN}npm run dev${RESET}     Start the development server`);
} else {
  log(`${BOLD}Next steps:${RESET}`);
  log(`  1. Add your API keys to ${CYAN}.env.local${RESET}`);
  log(`     ${DIM}At minimum, set ANTHROPIC_API_KEY${RESET}`);
  log(`     ${DIM}Get one at: https://console.anthropic.com/settings/keys${RESET}`);
  log('');
  log(`  ${DIM}Or set DEMO_MODE=true to try without API keys${RESET}`);
  log('');
  log(`  2. ${CYAN}npm run dev${RESET}     Start the development server`);
}

log('');
log(`  Then open ${CYAN}http://localhost:3000${RESET}`);
log('');
