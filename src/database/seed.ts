import type { SQLiteDatabase } from 'expo-sqlite';

interface SeedExercise {
  name: string;
  tips: string;
}

// Exercises extracted from treino-obsidian/extras/*.md
// muscle_group intentionally left NULL — to be classified manually in the app
const OBSIDIAN_EXERCISES: SeedExercise[] = []
/* const test = [
  // ── Peito ──────────────────────────────────────────────────────────────────
  { name: 'Supino com banco inclinado', tips: 'COM HALTER É MELHOR\n30 graus de inclinação no banco' },
  { name: 'Voador', tips: 'também chamado de peck deck fly' },
  { name: 'Crossover na polia alta', tips: 'basicamente é igual ao voador' },

  // ── Costas ─────────────────────────────────────────────────────────────────
  { name: 'Puxada frontal com barra reta', tips: '' },
  { name: 'Puxada frontal com triangulo', tips: '' },
  { name: 'Remada baixa com triangulo', tips: '' },
  { name: 'Remada baixa com barra', tips: '' },

  // ── Ombro ──────────────────────────────────────────────────────────────────
  { name: 'Desenvolvimento com halteres', tips: '' },
  { name: 'Elevação lateral', tips: '' },
  { name: 'Elevação frontal', tips: '' },
  { name: 'Posterior de ombro no voador inverso', tips: '' },

  // ── Bíceps ─────────────────────────────────────────────────────────────────
  { name: 'Bíceps sentado com banco inclinado', tips: '' },
  { name: 'Bíceps Martelo com halteres', tips: '' },
  { name: 'Bíceps com pegada pronada na polia', tips: '' },

  // ── Tríceps ────────────────────────────────────────────────────────────────
  { name: 'Tríceps com barra reta na polia alta', tips: 'NÃO FAZER COM PALMA PRA CIMA' },
  { name: 'Tríceps com barra na polia (altura da cintura)', tips: 'de costas pra polia, puxando de baixo para cima' },
  { name: 'Tríceps testa', tips: '' },

  // ── Quadríceps ─────────────────────────────────────────────────────────────
  { name: 'Agachamento no Smith', tips: 'é melhor fazer livre, sem a máquina' },
  { name: 'Legpress', tips: '' },
  { name: 'Extensora', tips: '' },

  // ── Posterior ──────────────────────────────────────────────────────────────
  { name: 'Flexora deitado', tips: '' },
  { name: 'Flexora sentado', tips: '' },
  { name: 'Abdutor', tips: '' },
  { name: 'Adutor', tips: 'dispensável' },

  // ── Panturrilha ────────────────────────────────────────────────────────────
  { name: 'Panturrilha sentado', tips: '' },
  { name: 'Panturrilha em pé', tips: '' },

  // ── Abdominal ──────────────────────────────────────────────────────────────
  { name: 'Prancha', tips: '' },
  { name: 'Abdominal deitado', tips: 'é o mesmo que o abdominal supra' },
]; */

export async function seedExercisesFromObsidian(db: SQLiteDatabase): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const ex of OBSIDIAN_EXERCISES) {
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)',
      [ex.name]
    );
    if (existing) {
      skipped++;
      continue;
    }
    await db.runAsync(
      'INSERT INTO exercises (name, description, tips, image_path, muscle_group) VALUES (?, ?, ?, ?, ?)',
      [ex.name, '', ex.tips, null, null]
    );
    inserted++;
    console.log(`[seed] Inserido: ${ex.name}`);
  }

  if (skipped > 0) {
    console.log(`[seed] Ignorados (já existiam): ${skipped}`);
  }
  console.log(`[seed] Importação Obsidian concluída: ${inserted} novos, ${skipped} já existiam`);
}
