/** Standalone ZIP documentation needs web links, not repository-relative links. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname, posix, join} from 'node:path';
const output = resolve(process.argv[2] || 'beta'); mkdirSync(output, {recursive:true});
for (const [source, target] of [['LICENSE','LICENSE'],['docs/installation.md','INSTALL.md'],['docs/legal/privacy.md','PRIVACY.md'],['docs/legal/third-party-notices.md','THIRD_PARTY_NOTICES.md']]) {
  const markdown = readFileSync(source, 'utf8').replace(/\]\(([^\s)]+)\)/g, (match, link) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(link)) return match;
    const path = posix.normalize(posix.join(dirname(source), link));
    return `](https://github.com/clark970417-eng/VocaLume/blob/main/${path})`;
  });
  writeFileSync(join(output, target), markdown);
}
