import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('scripts/fetch-windows-coreutils.ps1');
const isWindows = process.platform === 'win32';

test('Coreutils provisioning script pins the official architecture assets and digests', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(script, 'utf8');
  assert.match(source, /2026\.9\.3/);
  assert.match(source, /0ab345dc2b27a8563322ea351f99120e2b2e831f844f16c7b1a1620a20d837d1/i);
  assert.match(source, /e01a35c1856991e313564f02b540c6079274f0ecb3be22de764edd5341eabfaa/i);
});

test('Coreutils provisioning rejects an unsupported architecture', { skip: !isWindows }, () => {
  const result = invoke(['-Architecture', 'ia64', '-Destination', os.tmpdir()]);
  assert.notEqual(result.status, 0);
});

test('Coreutils provisioning rejects an archive digest mismatch', { skip: !isWindows }, async () => {
  await withFixture(async (fixture) => {
    const archive = await createArchive(fixture, { 'coreutils-2026.9.3-x64/coreutils.exe': 'stub' });
    const result = invoke([
      '-Architecture', 'x64', '-Destination', path.join(fixture, 'out'),
      '-ArchivePath', archive,
      '-LicenseSourcePath', path.join(fixture, 'LICENSE'), '-NoticeSourcePath', path.join(fixture, 'NOTICE.md'),
    ]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /SHA-256|digest|checksum/i);
  });
});

test('Coreutils provisioning rejects archives without the binary or license notices', { skip: !isWindows }, async () => {
  await withFixture(async (fixture) => {
    const missingBinary = await createArchive(fixture, { 'coreutils-2026.9.3-x64/readme.txt': 'stub' });
    await writeFile(path.join(fixture, 'LICENSE'), 'license');
    await writeFile(path.join(fixture, 'NOTICE.md'), 'notice');
    const missingBinaryResult = invoke([
      '-Architecture', 'x64', '-Destination', path.join(fixture, 'missing-binary'),
      '-ArchivePath', missingBinary,
      '-LicenseSourcePath', path.join(fixture, 'LICENSE'), '-NoticeSourcePath', path.join(fixture, 'NOTICE.md'),
    ], await sha256(missingBinary));
    assert.notEqual(missingBinaryResult.status, 0);
    assert.match(`${missingBinaryResult.stdout}\n${missingBinaryResult.stderr}`, /coreutils\.exe/i);

    const archive = await createArchive(fixture, { 'coreutils-2026.9.3-x64/coreutils.exe': 'stub' });
    const missingLicenseResult = invoke([
      '-Architecture', 'x64', '-Destination', path.join(fixture, 'missing-license'),
      '-ArchivePath', archive,
      '-LicenseSourcePath', path.join(fixture, 'absent-LICENSE'), '-NoticeSourcePath', path.join(fixture, 'NOTICE.md'),
    ], await sha256(archive));
    assert.notEqual(missingLicenseResult.status, 0);
    assert.match(`${missingLicenseResult.stdout}\n${missingLicenseResult.stderr}`, /license/i);

    const missingNoticeResult = invoke([
      '-Architecture', 'x64', '-Destination', path.join(fixture, 'missing-notice'),
      '-ArchivePath', archive,
      '-LicenseSourcePath', path.join(fixture, 'LICENSE'), '-NoticeSourcePath', path.join(fixture, 'absent-NOTICE.md'),
    ], await sha256(archive));
    assert.notEqual(missingNoticeResult.status, 0);
    assert.match(`${missingNoticeResult.stdout}\n${missingNoticeResult.stderr}`, /NOTICE|license/i);
  });
});

function invoke(args, expectedSha256) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      TERMINALWISELY_COREUTILS_TESTS: '1',
      TERMINALWISELY_COREUTILS_EXPECTED_SHA256: expectedSha256,
    },
  });
}

async function withFixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tw-coreutils-test-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createArchive(directory, files) {
  const source = path.join(directory, `source-${Math.random().toString(16).slice(2)}`);
  await mkdir(source, { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(source, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  const archive = `${source}.zip`;
  const quotedSource = source.replaceAll("'", "''");
  const quotedArchive = archive.replaceAll("'", "''");
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${quotedSource}\\*' -DestinationPath '${quotedArchive}'`], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, TERMINALWISELY_COREUTILS_TESTS: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return archive;
}

async function sha256(file) {
  const { createHash } = await import('node:crypto');
  const { readFile } = await import('node:fs/promises');
  return createHash('sha256').update(await readFile(file)).digest('hex');
}
