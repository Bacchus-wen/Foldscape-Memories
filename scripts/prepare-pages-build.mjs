import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Pages project sites live under /repository-name/. Rewrite only bundled
// resource roots, including URLs inside the screen composition manifests.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
if (!repository) throw new Error('GITHUB_REPOSITORY is required');
const prefix = repository.endsWith('.github.io') ? '' : `/${repository}`;
const root = path.resolve('dist/client');
const resourceUrl = /(["'`(])\/(assets|wallpapers|screen-content|models|app-icons)\//g;
async function prepare(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await prepare(file);
    else if (/\.(html|js|css|json|gltf|svg)$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      const output = source.replace(resourceUrl, `$1${prefix}/$2/`);
      if (source !== output) await writeFile(file, output);
    }
  }
}
await prepare(root);
await writeFile(path.join(root, '.nojekyll'), '');
console.log(`Prepared GitHub Pages at ${prefix || '/'}`);
