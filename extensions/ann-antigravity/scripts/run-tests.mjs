import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const compiledTestsRoot = join(extensionRoot, 'dist', 'test');
const testFiles = (await findTestFiles(compiledTestsRoot)).sort();

if (testFiles.length === 0) {
  throw new Error(`No compiled extension tests were found under ${compiledTestsRoot}`);
}

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--test', ...testFiles], {
    cwd: extensionRoot,
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  });

  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;

async function findTestFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(absolutePath);
    }
  }

  return files;
}
