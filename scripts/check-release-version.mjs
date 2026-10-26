import {readFileSync} from 'node:fs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const version = read('manifest.json').version;
const app = read('desktop-app/package.json'), lock = read('desktop-app/package-lock.json');
if ([app.version, lock.version, lock.packages?.['']?.version].some(v => v !== version)) throw new Error('App, extension and lockfile versions must match');
const tag = process.argv[2];
if (tag && !['main', `beta-v${version}`, `v${version}`].includes(tag)) throw new Error(`Tag ${tag} does not match version ${version}`);
console.log(`VocaLume ${version}: versions agree`);
