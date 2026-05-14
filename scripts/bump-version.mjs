#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const bumpType = args.find(a => !a.startsWith('--'));
const shouldTag = args.includes('--tag');

if (!bumpType) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--tag]');
  process.exit(1);
}

const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const currentVersion = rootPkg.version;

function bumpVersion(current, type) {
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default:
      console.error(`Invalid bump type: "${type}". Use patch, minor, major, or x.y.z`);
      process.exit(1);
  }
}

const newVersion = bumpVersion(currentVersion, bumpType);

if (newVersion === currentVersion) {
  console.error(`New version (${newVersion}) is the same as current version. Aborting.`);
  process.exit(1);
}

const jsonFiles = [
  'package.json',
  'apps/web/package.json',
  'apps/linux/package.json',
  'apps/windows/package.json',
  'apps/macos/package.json',
  'apps/linux/src-tauri/tauri.conf.json',
  'apps/windows/src-tauri/tauri.conf.json',
  'apps/macos/src-tauri/tauri.conf.json',
];

const cargoFiles = [
  'apps/linux/src-tauri/Cargo.toml',
  'apps/windows/src-tauri/Cargo.toml',
  'apps/macos/src-tauri/Cargo.toml',
];

const updated = [];
const skipped = [];

for (const rel of jsonFiles) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) { skipped.push(rel); continue; }
  const content = JSON.parse(readFileSync(path, 'utf8'));
  if (!('version' in content)) { skipped.push(rel); continue; }
  content.version = newVersion;
  writeFileSync(path, JSON.stringify(content, null, 2) + '\n');
  updated.push(rel);
}

for (const rel of cargoFiles) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) { skipped.push(rel); continue; }
  const original = readFileSync(path, 'utf8');
  const replaced = original.replace(/^version = "[\d.]+"/m, `version = "${newVersion}"`);
  if (replaced === original) { skipped.push(rel); continue; }
  writeFileSync(path, replaced);
  updated.push(rel);
}

console.log(`\nBumped ${currentVersion} → ${newVersion}\n`);
updated.forEach(f => console.log(`  updated  ${f}`));
if (skipped.length) skipped.forEach(f => console.log(`  skipped  ${f}`));

if (shouldTag) {
  const tag = `v${newVersion}`;
  const filesToStage = updated.join(' ');
  execSync(`git -C "${ROOT}" add ${filesToStage}`, { stdio: 'inherit' });
  execSync(`git -C "${ROOT}" commit -m "chore: bump version to ${newVersion}"`, { stdio: 'inherit' });
  execSync(`git -C "${ROOT}" tag ${tag}`, { stdio: 'inherit' });
  console.log(`\nCreated commit and tag ${tag}`);
}
