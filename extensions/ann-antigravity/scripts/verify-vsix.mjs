import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = join(extensionRoot, 'out', 'ann-guardian-control-room-0.3.0.vsix');
const artifactStat = await stat(artifactPath);

assert.ok(artifactStat.isFile(), 'Expected VSIX artifact is not a file.');
assert.ok(artifactStat.size > 0, 'Expected VSIX artifact is empty.');

const archive = await JSZip.loadAsync(await readFile(artifactPath));
const archiveFiles = Object.values(archive.files).filter((entry) => !entry.dir);
const archivePaths = archiveFiles.map((entry) => entry.name);

const manifestEntry = archive.file('extension/package.json');
assert.ok(manifestEntry, 'VSIX does not include extension/package.json.');
const manifest = JSON.parse(await manifestEntry.async('string'));
const normalizedMain = String(manifest.main ?? '').replace(/^\.\//, '').replaceAll('\\', '/');

assert.equal(manifest.name, 'ann-guardian-control-room');
assert.equal(manifest.version, '0.3.0');
assert.equal(manifest.displayName, 'ANN Guardian Home');
assert.ok(
  manifest.activationEvents?.includes('onView:annGuardian.controlRoom'),
  'UX0 Home view does not have an explicit activation event.',
);
assert.equal(
  manifest.contributes?.views?.annGuardian?.find((view) => view.id === 'annGuardian.controlRoom')?.name,
  'Home',
);
assert.equal(
  manifest.contributes?.views?.annGuardian?.find((view) => view.id === 'annGuardian.accountCenter')?.name,
  'Account Center',
);
assert.equal(
  manifest.contributes?.views?.annGuardian?.find((view) => view.id === 'annGuardian.projects')?.name,
  'My Projects',
);
const contributedCommands = new Set(
  (manifest.contributes?.commands ?? []).map((command) => command.command),
);
for (const requiredCommand of [
  'annGuardian.configureUserProfile',
  'annGuardian.configureChatGptMentor',
  'annGuardian.openChatGptMentor',
  'annGuardian.openProject',
  'annGuardian.runVerification',
  'annGuardian.loginGpt',
  'annGuardian.setGptAccountLabel',
  'annGuardian.changeGptAccount',
  'annGuardian.clearGptAccountContext',
  'annGuardian.registerCurrentProject',
  'annGuardian.openExistingProject',
  'annGuardian.newPersonalProject',
  'annGuardian.openRegisteredProject',
  'annGuardian.removeRegisteredProject',
  'annGuardian.mapProjectGptAccount',
  'annGuardian.configureProjectChatGptLink',
  'annGuardian.openProjectChatGptLink',
]) {
  assert.ok(contributedCommands.has(requiredCommand), `VSIX is missing UX0 command: ${requiredCommand}`);
}
assert.ok(normalizedMain, 'Extension manifest does not declare a main entrypoint.');
assert.ok(
  archivePaths.includes(`extension/${normalizedMain}`),
  `VSIX does not include declared extension entrypoint: extension/${normalizedMain}`,
);
assert.ok(archivePaths.includes('extension/media/ann.svg'), 'VSIX does not include the ANN activity icon.');
for (const requiredEntrypoint of [
  'extension/dist/src/account-center-provider.js',
  'extension/dist/src/local-workspace.js',
  'extension/dist/src/projects-tree-provider.js',
  'extension/dist/src/project-root-status.js',
]) {
  assert.ok(archivePaths.includes(requiredEntrypoint), `VSIX is missing UX0.5 entrypoint: ${requiredEntrypoint}`);
}

for (const archivePath of archivePaths) {
  const normalizedPath = archivePath.toLowerCase();
  assert.doesNotMatch(normalizedPath, /(^|\/)\.env(?:\.|\/|$)/, `Environment file was packaged: ${archivePath}`);
  assert.ok(
    !normalizedPath.startsWith('extension/node_modules/'),
    `node_modules content was packaged: ${archivePath}`,
  );
  assert.doesNotMatch(
    normalizedPath,
    /^extension\/(?:test|tests|fixtures)\//,
    `Test or fixture content was packaged: ${archivePath}`,
  );
}

const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

for (const entry of archiveFiles) {
  if (!/\.(?:js|json|md|svg|xml|yml|yaml)$/i.test(entry.name)) continue;
  const content = await entry.async('string');
  for (const pattern of credentialPatterns) {
    assert.doesNotMatch(content, pattern, `Credential-like material was packaged in ${entry.name}`);
  }
}

console.log(`Verified ${artifactPath} (${artifactStat.size} bytes, ${archiveFiles.length} files).`);
