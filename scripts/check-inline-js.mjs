import { readFileSync } from 'node:fs';

const htmlFiles = ['index.html', 'vk/index.html'];
let failed = false;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match, index) => ({ index, tag: match[0].slice(0, match[0].indexOf('>') + 1), code: match[1] }))
    .filter((script) => script.code.trim());

  for (const script of scripts) {
    try {
      new Function(script.code);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${file} inline script #${script.index} ${script.tag}: ${error.message}`);
    }
  }

  if (!failed) console.log(`OK ${file}: ${scripts.length} inline scripts parsed`);
}

try {
  const worker = readFileSync('backend/worker.js', 'utf8')
    .replace('export default {', 'const workerModule = {');
  new Function(worker);
  console.log('OK backend/worker.js: syntax parsed');
} catch (error) {
  failed = true;
  console.error(`FAIL backend/worker.js: ${error.message}`);
}

if (failed) process.exit(1);
