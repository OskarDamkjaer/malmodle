import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const TAG = 'dev-assets-v2';
const FILE = 'dev-assets.tar.gz';

const SHA256 = '0c05575eb26495147d5ffe8ed37fb375773fe41c96d9db956cfb270136bebd08';

const CHECKS = [
  'build/data/districts.geojson',
  'data/cache/malmo.pmtiles',
  'data/cache/streets.json',
  'app/glyphs/Roboto Regular',
  'app/sprite/osm-liberty.json',
];

function allPresent() {
  return CHECKS.every((p) => existsSync(p));
}

if (allPresent()) {
  console.log('fetch-dev-assets: everything present, nothing to do');
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

function download() {
  console.log(`fetch-dev-assets: downloading ${TAG}/${FILE} …`);
  const repo = repository();
  const id = execSync(
    `gh api "repos/${repo}/releases/tags/${TAG}" --jq '.assets[] | select(.name == "${FILE}") | .id'`,
    { encoding: 'utf8' },
  ).trim();
  if (!id) throw new Error(`${FILE} is not attached to ${TAG}`);
  execSync(
    `gh api -H "Accept: application/octet-stream" "repos/${repo}/releases/assets/${id}" > "${tmp}"`,
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (!existsSync(tmp)) throw new Error('download produced no file');
}

function verify() {
  const hash = createHash('sha256');
  hash.update(readFileSync(tmp));
  const got = hash.digest('hex');
  if (got !== SHA256) {
    throw new Error(`checksum mismatch: expected ${SHA256}, got ${got}`);
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
  console.log('fetch-dev-assets: done');
} catch (err) {
  rmSync(tmp, { force: true });
  console.error(`fetch-dev-assets: ${err.message}`);
  process.exit(1);
}
