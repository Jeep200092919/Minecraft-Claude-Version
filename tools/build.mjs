// Zero-dependency bundler: turns index.html + style.css + the ES modules in
// src/ into ONE self-contained HTML file (dist/claudecraft.html) that can be
// opened straight from disk (file://) with no server.
//
// It supports the subset of module syntax used in this project:
//   import { a, b as c } from './x.js';
//   export function / class / const / let / var <name>
// Each module is wrapped in its own function scope, so private top-level
// names never collide between modules.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const IMPORT_RE = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm;
const NAMESPACE_IMPORT_RE = /^\s*import\s*\*\s*as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]\s*;?/gm;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]\s*;?/gm;
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

export async function bundle(entry) {
  const modules = new Map(); // abs path -> { id, code, deps }
  const order = [];

  async function visit(file, stack = []) {
    if (modules.has(file)) return;
    if (stack.includes(file)) {
      throw new Error(`Circular import: ${[...stack, file].map((f) => relative(ROOT, f)).join(' -> ')}`);
    }
    const source = await readFile(file, 'utf8');
    const deps = [];
    const importLines = [];
    let body = source.replace(IMPORT_RE, (_, names, spec) => {
      const dep = resolve(dirname(file), spec);
      deps.push(dep);
      const bindings = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
          return m ? `${m[1]}: ${m[2]}` : s;
        });
      importLines.push({ dep, bindings });
      return '';
    });
    body = body.replace(NAMESPACE_IMPORT_RE, (_, name, spec) => {
      const dep = resolve(dirname(file), spec);
      deps.push(dep);
      importLines.push({ dep, namespace: name });
      return '';
    });
    body = body.replace(SIDE_EFFECT_IMPORT_RE, (_, spec) => {
      deps.push(resolve(dirname(file), spec));
      return '';
    });
    const exported = [];
    body = body.replace(EXPORT_RE, (match, name) => {
      exported.push(name);
      return match.replace(/^export\s+/, '');
    });
    if (/^\s*export\s/m.test(body)) {
      throw new Error(`Unsupported export syntax in ${relative(ROOT, file)}`);
    }
    for (const dep of deps) await visit(dep, [...stack, file]);
    const id = `__mod${order.length}`;
    modules.set(file, { id, body, importLines, exported });
    order.push(file);
  }

  await visit(resolve(entry));

  let out = '';
  for (const file of order) {
    const mod = modules.get(file);
    const imports = mod.importLines
      .map(({ dep, bindings, namespace }) => (namespace
        ? `const ${namespace} = ${modules.get(dep).id};`
        : `const { ${bindings.join(', ')} } = ${modules.get(dep).id};`))
      .join('\n');
    out += `// ---- ${relative(ROOT, file)} ----\n`;
    out += `const ${mod.id} = (() => {\n${imports}\n${mod.body}\nreturn { ${mod.exported.join(', ')} };\n})();\n`;
  }
  return `(() => {\n'use strict';\n${out}})();\n`;
}

export async function buildDist() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const css = await readFile(join(ROOT, 'style.css'), 'utf8');
  const js = await bundle(join(ROOT, 'src/main.js'));
  // Guard against a literal "</script>" inside the bundle ending the tag early.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  let result = html.replace(
    /<link rel="stylesheet" href="style\.css"\s*\/?>/,
    () => `<style>\n${css}\n</style>`,
  );
  result = result.replace(
    /<script type="module" src="src\/main\.js"><\/script>/,
    () => `<script>\n${safeJs}</script>`,
  );
  if (result.includes('src="src/main.js"') || result.includes('href="style.css"')) {
    throw new Error('index.html is missing the expected stylesheet/script tags');
  }
  await mkdir(join(ROOT, 'dist'), { recursive: true });
  const outFile = join(ROOT, 'dist/claudecraft.html');
  await writeFile(outFile, result);
  console.log(`Built ${relative(ROOT, outFile)} (${(result.length / 1024).toFixed(1)} KiB)`);
  return outFile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildDist().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
