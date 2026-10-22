// Publishes docs/standards and docs/pipeline to the GitHub wiki.
// The repo is the source of truth: every wiki page is regenerated from it, and pages
// whose source file was deleted are removed. Usage: node publish-wiki.mjs <repo-root> <wiki-dir>
import fs from 'node:fs';
import path from 'node:path';

const [root, wiki] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY || 'wren-science/salesforce-pipeline';
const branch = process.env.GITHUB_REF_NAME || 'integration';
const SECTIONS = [
  { dir: 'docs/standards', prefix: 'Standards', title: 'Engineering standards' },
  { dir: 'docs/pipeline', prefix: 'Pipeline', title: 'Pipeline' },
];
const MANAGED = /^(Home|_Sidebar|(Standards|Pipeline)(-.+)?)\.md$/;

const words = (s) => s.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
const pageName = (rel) => {
  const s = SECTIONS.find((x) => rel.startsWith(x.dir + '/'));
  if (!s) return null;
  const base = path.basename(rel, '.md');
  return base === 'README' ? s.prefix : `${s.prefix}-${words(base)}`;
};

const pages = new Map(); // source path -> wiki page name
for (const s of SECTIONS) {
  for (const f of fs.readdirSync(path.join(root, s.dir)).filter((f) => f.endsWith('.md')).sort()) {
    pages.set(`${s.dir}/${f}`, pageName(`${s.dir}/${f}`));
  }
}

const rewriteLinks = (md, src) =>
  md.replace(/\]\((?!https?:|#|mailto:)([^)\s#]+)(#[^)]*)?\)/g, (m, target, anchor = '') => {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(src), target));
    if (pages.has(rel)) return `](${pages.get(rel)}${anchor})`;
    return `](https://github.com/${repo}/blob/${branch}/${rel}${anchor})`;
  });

for (const f of fs.readdirSync(wiki)) if (MANAGED.test(f)) fs.rmSync(path.join(wiki, f));

for (const [src, name] of pages) {
  const body = rewriteLinks(fs.readFileSync(path.join(root, src), 'utf8'), src);
  const banner =
    `> **Generated from [\`${src}\`](https://github.com/${repo}/blob/${branch}/${src}).** ` +
    `Edits here are overwritten; change the file in the repo through a pull request.\n\n`;
  fs.writeFileSync(path.join(wiki, `${name}.md`), banner + body);
}

const list = (s) =>
  [...pages].filter(([src]) => src.startsWith(s.dir + '/')).map(([, n]) => `- [${n.replace(/-/g, ' ')}](${n})`).join('\n');
const index = SECTIONS.map((s) => `### ${s.title}\n\n${list(s)}`).join('\n\n');
fs.writeFileSync(
  path.join(wiki, 'Home.md'),
  `# salesforce-pipeline wiki\n\nA read-only view of the repo's docs. The source of truth is the ` +
    `[repo](https://github.com/${repo}); this wiki is regenerated on every change to \`docs/\`.\n\n${index}\n`,
);
fs.writeFileSync(path.join(wiki, '_Sidebar.md'), `**[Home](Home)**\n\n${index}\n`);
console.log(`Published ${pages.size} pages`);
