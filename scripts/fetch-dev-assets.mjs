import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { devAssetsTag } from './lib/dev-assets.mjs';

const TAG = devAssetsTag();
const FILE = 'dev-assets.tar.gz';
const STAMP = 'data/cache/dev-assets.tag';

const CHECKS = [
  'build/data/districts.geojson',
  'data/cache/malmo.pmtiles',
  'data/cache/streets.json',
  'data/cache/shapes.json',
];

function allPresent() {
  return CHECKS.every((p) => existsSync(p));
}

const stamp = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : '';

if (allPresent() && stamp === TAG) {
  console.log(`fetch-dev-assets: ${TAG} present, nothing to do`);
  process.exit(0);
}

const tmp = join('/tmp', `dev-assets-${process.pid}.tar.gz`);

function repository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  const match = url.match(/([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`cannot read the repository from ${url}`);
  return match[1];
}

function published(repo, tag) {
  try {
    execSync(`gh api "repos/${repo}/releases/tags/${tag}" --silent`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function newest(repo) {
  return execSync(`gh release list --repo "${repo}" --limit 50 --json tagName --jq '.[].tagName'`, { encoding: 'utf8' })
    .split('\n').find((t) => t.startsWith('dev-assets-'));
}

function asset(repo, tag, name) {
  const id = execSync(
    `gh api "repos/${repo}/releases/tags/${tag}" --jq '.assets[] | select(.name == "${name}") | .id'`,
    { encoding: 'utf8' },
  ).trim();
  if (!id) throw new Error(`${name} is not attached to ${tag}`);
  return execSync(`gh api -H "Accept: application/octet-stream" "repos/${repo}/releases/assets/${id}"`, { maxBuffer: 1 << 30 });
}

let expected = '';
let tag = TAG;

function download() {
  const repo = repository();
  if (!published(repo, TAG)) {
    const why = `${TAG} is not published: the map data inputs changed and the deploy has not rebuilt them yet`;
    if (process.env.CI) throw new Error(why);
    if (allPresent()) {
      console.warn(`fetch-dev-assets: ${why}; keeping ${stamp || 'the map data already here'}`);
      process.exit(0);
    }
    tag = newest(repo);
    if (!tag) throw new Error(why);
    console.warn(`fetch-dev-assets: ${why}; using ${tag}`);
  }
  console.log(`fetch-dev-assets: downloading ${tag}/${FILE} …`);
  expected = asset(repo, tag, `${FILE}.sha256`).toString().trim();
  writeFileSync(tmp, asset(repo, tag, FILE));
}

function verify() {
  const hash = createHash('sha256');
  hash.update(readFileSync(tmp));
  const got = hash.digest('hex');
  if (got !== expected) {
    throw new Error(`checksum mismatch: expected ${expected}, got ${got}`);
  }
  console.log('fetch-dev-assets: checksum ok');
}

function unpack() {
  console.log('fetch-dev-assets: unpacking …');
  execSync(`tar xzf "${tmp}" 2>/dev/null`, { stdio: 'inherit' });
  rmSync(tmp, { force: true });
}

try {
  download();
  verify();
  unpack();
  if (!allPresent()) {
    throw new Error('archive unpacked but expected files are missing');
  }
  writeFileSync(STAMP, `${tag}\n`);
  console.log(`fetch-dev-assets: ${tag} done`);
} catch (err) {
  rmSync(tmp, { force: true });
  console.error(`fetch-dev-assets: ${err.message}`);
  process.exit(1);
}
