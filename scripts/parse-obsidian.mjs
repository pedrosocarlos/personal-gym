/**
 * parse-obsidian.mjs
 * Reads treino-obsidian/**\/*.md and generates src/database/seed.json
 * Run: node scripts/parse-obsidian.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─── Mappings ─────────────────────────────────────────────────────────────────

const FILENAME_TO_MUSCLE = {
  'Peito': 'Peito',
  'Costas': 'Costas',
  'Ombro': 'Ombro',
  'Bíceps': 'Bíceps',
  'Tríceps': 'Tríceps',
  'Quadríceps': 'Quadríceps',
  'Posterior': 'Posterior',
  'Panturrilha': 'Panturrilha',
  'Abdominal': 'Abdômen',
};

// Normalised section headings found in treino *.md files
const SECTION_TO_MUSCLE = {
  'peito': 'Peito',
  'costas': 'Costas',
  'ombro': 'Ombro',
  'biceps': 'Bíceps',
  'triceps': 'Tríceps',
  'quadriceps': 'Quadríceps',
  'posterior': 'Posterior',
  'panturrilha': 'Panturrilha',
  'abdominal': 'Abdômen',
  'cardio': 'Cardio',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanBody(text) {
  return text
    .split('\n')
    .filter(l => !l.match(/^!\[\[/))           // drop ![[image]] lines
    .filter(l => l.trim() !== 'ou')            // drop lone "ou" between images
    .map(l =>
      l
        .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, '$1') // strip bold/italic
        .replace(/\[\[.*?\]\]/g, '')                 // strip [[wiki links]]
        .trim()
    )
    .filter(l => l.length > 0)
    .join('\n')
    .trim();
}

function parseReps(raw) {
  const s = raw.trim();
  // "4x1min"
  const minM = s.match(/(\d+)\s*[xX×]\s*(\d+)\s*min/i);
  if (minM) return { sets: +minM[1], reps: +minM[2] * 60 };
  // "4x15"
  const repM = s.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (repM) return { sets: +repM[1], reps: +repM[2] };
  // "30 min" (cardio)
  const durM = s.match(/(\d+)\s*min/i);
  if (durM) return { sets: 1, reps: +durM[1] };
  return { sets: 3, reps: 10 };
}

// ─── extras/*.md parser ───────────────────────────────────────────────────────
// Format: # ExerciseName\ndescription text\n![[img]]...

function parseExtrasFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.md');
  const muscle_group = FILENAME_TO_MUSCLE[filename] ?? null;
  const exercises = [];

  for (const part of content.split(/(?=^# )/m)) {
    if (!part.startsWith('# ')) continue;
    const lines = part.split('\n');
    const name = lines[0].replace(/^# /, '').trim();
    if (!name) continue;
    const tips = cleanBody(lines.slice(1).join('\n'));
    exercises.push({ name, description: '', tips, muscle_group });
  }

  return exercises;
}

// ─── treino *.md parser ───────────────────────────────────────────────────────
// Format: # MuscleGroup\n| table | with | nome | column |

function parseWorkoutFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.md');
  const workoutName = filename.charAt(0).toUpperCase() + filename.slice(1);

  const exercises = [];
  let currentMuscle = null;
  let nameIdx = -1;
  let repsIdx = -1;

  for (const line of content.split('\n')) {
    // Section heading → muscle group
    if (line.startsWith('# ')) {
      const heading = line.replace(/^# /, '').trim();
      currentMuscle = SECTION_TO_MUSCLE[norm(heading)] ?? heading;
      nameIdx = -1;
      repsIdx = -1;
      continue;
    }

    if (!line.startsWith('|')) continue;

    // Separator row (contains :--- or :---)
    if (/\|[\s:]-+[\s:]?\|/.test(line)) continue;

    // Parse columns: slice off leading/trailing empty strings from split
    const cols = line.split('|').slice(1, -1).map(c => c.trim());

    // Header row: contains "nome"
    const nomeAt = cols.findIndex(c => c.toLowerCase() === 'nome');
    if (nomeAt !== -1) {
      nameIdx = nomeAt;
      repsIdx = cols.findIndex(c => c.toLowerCase().includes('rep'));
      continue;
    }

    if (nameIdx === -1 || nameIdx >= cols.length) continue;

    // Data row
    const raw = cols[nameIdx] ?? '';
    if (!raw || raw.includes('<input') || raw.toLowerCase() === 'feito') continue;

    const exerciseName = raw
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, '$1')
      .trim();

    if (!exerciseName) continue;

    const repsStr = repsIdx !== -1 ? (cols[repsIdx] ?? '') : '';
    const { sets, reps } = parseReps(repsStr);

    exercises.push({ exerciseName, muscleGroup: currentMuscle, sets, reps, rest_seconds: 60 });
  }

  return { workoutName, exercises };
}

// ─── Fuzzy matcher ────────────────────────────────────────────────────────────

function fuzzyFind(trenoName, extrasExercises) {
  const n = norm(trenoName);
  // 1. Exact
  const ex = extrasExercises.find(e => norm(e.name) === n);
  if (ex) return ex;
  // 2. Extras name is prefix of treino name ("Puxada frontal com barra reta" ⊂ "...na máquina")
  const pre = extrasExercises.find(e => n.startsWith(norm(e.name)));
  if (pre) return pre;
  // 3. Treino name is prefix of extras name
  const inv = extrasExercises.find(e => norm(e.name).startsWith(n));
  if (inv) return inv;
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const EXTRAS_DIR = path.join(ROOT, 'treino-obsidian', 'extras');
const TREINO_DIR = path.join(ROOT, 'treino-obsidian');

// 1. Parse extras/ → canonical exercises with descriptions
const extrasExercises = [];
for (const f of fs.readdirSync(EXTRAS_DIR).sort()) {
  if (!f.endsWith('.md')) continue;
  extrasExercises.push(...parseExtrasFile(path.join(EXTRAS_DIR, f)));
}

// 2. Parse treino *.md files
const treinos = fs
  .readdirSync(TREINO_DIR)
  .filter(f => f.endsWith('.md'))
  .sort()
  .map(f => parseWorkoutFile(path.join(TREINO_DIR, f)));

// 3. Merge exercise list: extras first, then new ones from treinos
const exerciseMap = new Map(); // norm(name) → exercise object
for (const ex of extrasExercises) exerciseMap.set(norm(ex.name), ex);

for (const treino of treinos) {
  for (const we of treino.exercises) {
    const matched = fuzzyFind(we.exerciseName, extrasExercises);
    if (!matched && !exerciseMap.has(norm(we.exerciseName))) {
      exerciseMap.set(norm(we.exerciseName), {
        name: we.exerciseName,
        description: '',
        tips: '',
        muscle_group: we.muscleGroup,
      });
    }
  }
}

const allExercises = Array.from(exerciseMap.values());

// 4. Build workouts with resolved exercise names
const workouts = treinos.map(t => ({
  name: t.workoutName,
  exercises: t.exercises.map(we => {
    const match = fuzzyFind(we.exerciseName, extrasExercises);
    return {
      exerciseName: match ? match.name : we.exerciseName,
      sets: we.sets,
      reps: we.reps,
      rest_seconds: we.rest_seconds,
    };
  }),
}));

// 5. Write seed.json
const OUTPUT = path.join(ROOT, 'src', 'database', 'seed.json');
fs.writeFileSync(OUTPUT, JSON.stringify({ exercises: allExercises, workouts }, null, 2), 'utf-8');

// ─── Report ───────────────────────────────────────────────────────────────────

const fromExtras = allExercises.filter(e => extrasExercises.some(ex => norm(ex.name) === norm(e.name)));
const fromTreino = allExercises.filter(e => !extrasExercises.some(ex => norm(ex.name) === norm(e.name)));

console.log('\n✅  seed.json gravado em:', OUTPUT);
console.log(`\n📦  Exercícios: ${allExercises.length} únicos`);
console.log(`    • ${fromExtras.length} de extras/ (com descrição/dicas)`);
console.log(`    • ${fromTreino.length} somente dos treinos (sem dicas)`);
console.log(`\n🏋️   Treinos: ${treinos.map(t => t.workoutName).join(', ')}`);

console.log('\n─── Exercícios de extras/ ─────────────────────────────────────────');
for (const ex of fromExtras) {
  console.log(`  [${ex.muscle_group ?? 'null'}]  ${ex.name}`);
  if (ex.tips) console.log(`      💡 ${ex.tips.split('\n')[0]}`);
}

console.log('\n─── Exercícios novos (só dos treinos) ─────────────────────────────');
for (const ex of fromTreino) {
  console.log(`  [${ex.muscle_group ?? 'null'}]  ${ex.name}`);
}

console.log('\n─── Composição dos treinos ─────────────────────────────────────────');
for (const t of workouts) {
  console.log(`\n  ${t.name} (${t.exercises.length} exercícios)`);
  for (const we of t.exercises) {
    console.log(`    ${we.sets}×${we.reps}  ${we.exerciseName}`);
  }
}
