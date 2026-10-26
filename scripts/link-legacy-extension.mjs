/** Preserve an existing root-loaded macOS extension ID after source reorganization.
 * New installations should load extension/. No browser profile is read or changed. */
import {readdirSync, existsSync, lstatSync, readlinkSync, symlinkSync} from 'node:fs';
import {resolve, join, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'extension'), checkOnly = process.argv.includes('--check');
if (process.platform !== 'darwin' && !checkOnly) throw new Error('Compatibility aliases are for existing macOS installations; load extension/ for a new installation.');
const entries = readdirSync(source, {withFileTypes:true}).filter(e => e.isDirectory() || /\.(?:m?js|mts|css|html|json|png)$/.test(e.name));
let count = 0;
for (const entry of entries) {
  const destination = join(root, entry.name), target = relative(root, join(source, entry.name));
  const present = existsSync(destination) || (()=>{try{return lstatSync(destination).isSymbolicLink()}catch{return false}})();
  if (present) {
    if (!lstatSync(destination).isSymbolicLink() || readlinkSync(destination) !== target) throw new Error('Refusing to replace existing path: '+entry.name);
  } else if (checkOnly) throw new Error('Missing compatibility alias: '+entry.name);
  else symlinkSync(target, destination, entry.isDirectory() ? 'dir' : 'file');
  count++;
}
console.log(`${count} local extension aliases ${checkOnly ? 'verified' : 'ready'}; existing root-loaded extension path is unchanged.`);
