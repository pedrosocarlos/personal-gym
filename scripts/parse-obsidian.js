// Preview script: parses treino-obsidian/extras/*.md and lists exercises to be imported.
// Run with: node scripts/parse-obsidian.js
const fs = require('fs');
const path = require('path');

const extrasDir = path.join(__dirname, '..', 'treino-obsidian', 'extras');

function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const exercises = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      if (current) exercises.push(finalise(current));
      current = { name: trimmed.slice(2).trim(), tips: '' };
      continue;
    }

    if (!current) continue;
    if (/^!\[\[.*\]\]$/.test(trimmed)) continue; // Obsidian image syntax
    if (trimmed === '') continue;

    current.tips += (current.tips ? '\n' : '') + trimmed;
  }

  if (current) exercises.push(finalise(current));
  return exercises;
}

function finalise(ex) {
  const tips = ex.tips
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // strip markdown bold/italic
    .trim();
  return { name: ex.name, tips };
}

const mdFiles = fs.readdirSync(extrasDir)
  .filter(f => f.endsWith('.md'))
  .sort()
  .map(f => ({ file: f, fullPath: path.join(extrasDir, f) }));

console.log('\n=== Exercícios a importar do Obsidian ===\n');

let total = 0;
for (const { file, fullPath } of mdFiles) {
  const group = path.basename(file, '.md');
  const exercises = parseMarkdownFile(fullPath);
  console.log(`\n${group} (${exercises.length} exercício${exercises.length !== 1 ? 's' : ''})`);
  for (const ex of exercises) {
    console.log(`  • ${ex.name}`);
    if (ex.tips) {
      for (const line of ex.tips.split('\n')) {
        console.log(`      ${line}`);
      }
    }
    total++;
  }
}

console.log(`\nTotal: ${total} exercícios em ${mdFiles.length} arquivos\n`);
