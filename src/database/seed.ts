import type { SQLiteDatabase } from 'expo-sqlite';

interface SeedExercise {
  name: string;
  tips: string;
  muscle_group: string | null;
}

interface SeedWorkoutExercise {
  exerciseName: string;
  sets: number;
  reps: number;
  restSeconds: number;
}

interface SeedWorkout {
  name: string;
  exercises: SeedWorkoutExercise[];
}

const ALL_EXERCISES: SeedExercise[] = [
  // Peito
  { name: 'Supino com banco inclinado', tips: 'COM HALTER É MELHOR\n30 graus de inclinação no banco', muscle_group: 'Peito' },
  { name: 'Supino reto no Smith',        tips: '',                                                      muscle_group: 'Peito' },
  { name: 'Flexão de braço',             tips: '',                                                      muscle_group: 'Peito' },
  { name: 'Voador',                      tips: 'também chamado de peck deck fly',                       muscle_group: 'Peito' },
  { name: 'Crossover na polia alta',     tips: 'basicamente é igual ao voador',                         muscle_group: 'Peito' },
  // Costas
  { name: 'Puxada frontal com barra reta',   tips: '', muscle_group: 'Costas' },
  { name: 'Puxada frontal com triangulo',    tips: '', muscle_group: 'Costas' },
  { name: 'Remada baixa com triangulo',      tips: '', muscle_group: 'Costas' },
  { name: 'Remada baixa com barra',          tips: '', muscle_group: 'Costas' },
  { name: 'Remada curvada pronada',          tips: '', muscle_group: 'Costas' },
  // Ombro
  { name: 'Desenvolvimento com halteres',         tips: '', muscle_group: 'Ombro' },
  { name: 'Elevação lateral',                     tips: '', muscle_group: 'Ombro' },
  { name: 'Elevação frontal',                     tips: '', muscle_group: 'Ombro' },
  { name: 'Posterior de ombro no voador inverso', tips: '', muscle_group: 'Ombro' },
  // Bíceps
  { name: 'Rosca direta com barra W',          tips: '', muscle_group: 'Bíceps' },
  { name: 'Rosca alternada',                   tips: '', muscle_group: 'Bíceps' },
  { name: 'Rosca inversa com barra W',         tips: '', muscle_group: 'Bíceps' },
  { name: 'Bíceps sentado com banco inclinado', tips: '', muscle_group: 'Bíceps' },
  { name: 'Bíceps Martelo com halteres',       tips: '', muscle_group: 'Bíceps' },
  { name: 'Bíceps com pegada pronada na polia', tips: '', muscle_group: 'Bíceps' },
  // Tríceps
  { name: 'Tríceps com barra reta na polia alta',       tips: 'NÃO FAZER COM PALMA PRA CIMA',                        muscle_group: 'Tríceps' },
  { name: 'Tríceps francês sentado',                    tips: '',                                                     muscle_group: 'Tríceps' },
  { name: 'Tríceps com barra na polia (altura da cintura)', tips: 'de costas pra polia, puxando de baixo para cima', muscle_group: 'Tríceps' },
  { name: 'Tríceps testa', tips: '', muscle_group: 'Tríceps' },
  // Quadríceps
  { name: 'Agachamento no Smith', tips: 'é melhor fazer livre, sem a máquina', muscle_group: 'Quadríceps' },
  { name: 'Legpress', tips: 'Pés paralelos', muscle_group: 'Quadríceps' },
  { name: 'Cadeira extensora', tips: '', muscle_group: 'Quadríceps' },
  // Posterior / Isquiotibiais
  { name: 'Mesa flexora', tips: '', muscle_group: 'Posterior' },
  { name: 'Cadeira abdutora', tips: '', muscle_group: 'Posterior' },
  { name: 'Cadeira adutora',          tips: 'dispensável', muscle_group: 'Posterior' },
  // Gluteo
  { name: 'Elevação pévica', tips: '', muscle_group: 'Gluteo' },
  // Panturrilha
  { name: 'Panturrilha sentado', tips: '', muscle_group: 'Panturrilha' },
  { name: 'Panturrilha em pé',   tips: '', muscle_group: 'Panturrilha' },
  // Abdominal
  { name: 'Abdominal crunch', tips: 'é o mesmo que o abdominal supra', muscle_group: 'Abdominal' },
  { name: 'Prancha',          tips: '',                                 muscle_group: 'Abdominal' },
];

const SEED_WORKOUTS: SeedWorkout[] = [
  {
    name: 'Treino A — Pernas',
    exercises: [
      { exerciseName: 'Cadeira abdutora',   sets: 5, reps: 15, restSeconds: 60 },
      { exerciseName: 'Elevação pévica',               sets: 4, reps: 15, restSeconds: 60 },
      { exerciseName: 'Cadeira adutora',              sets: 4, reps: 15, restSeconds: 60 },
      { exerciseName: 'Mesa flexora',        sets: 4, reps: 15, restSeconds: 60 },
      { exerciseName: 'Legpress',                sets: 4, reps: 15, restSeconds: 60 },
      { exerciseName: 'Cadeira extensora',                 sets: 4, reps: 15, restSeconds: 60 },
      { exerciseName: 'Panturrilha em pé',    sets: 5, reps: 15, restSeconds: 60 },
      { exerciseName: 'Panturrilha sentado',      sets: 5, reps: 15, restSeconds: 60 },
      { exerciseName: 'Abdominal crunch',       sets: 3, reps: 30, restSeconds: 60 },
    ],
  },
  /* {
    name: 'Treino B — Braço e Peito',
    exercises: [
      { exerciseName: 'Supino com banco inclinado',           sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Supino reto no Smith',                 sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Flexão de braço',                      sets: 4, reps: 15, restSeconds: 60 },
      { exerciseName: 'Rosca direta com barra W',             sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Rosca alternada',                      sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Rosca inversa com barra W',            sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Tríceps com barra reta na polia alta', sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Tríceps francês sentado',              sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Tríceps testa',                        sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Prancha',                              sets: 4, reps: 1,  restSeconds: 60 },
      { exerciseName: 'Abdominal crunch',                     sets: 3, reps: 20, restSeconds: 60 },
    ],
  },
  {
    name: 'Treino C — Costas e Ombro',
    exercises: [
      { exerciseName: 'Puxada frontal com barra reta',        sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Puxada frontal com triangulo',         sets: 4, reps: 15, restSeconds: 90 },
      { exerciseName: 'Remada baixa com triangulo',           sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Remada curvada pronada',               sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Desenvolvimento com halteres',         sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Elevação lateral',                     sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Elevação frontal',                     sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Posterior de ombro no voador inverso', sets: 3, reps: 15, restSeconds: 90 },
      { exerciseName: 'Prancha',                              sets: 4, reps: 1,  restSeconds: 60 },
      { exerciseName: 'Abdominal crunch',                     sets: 3, reps: 20, restSeconds: 60 },
    ],
  }, */
];

export async function seedDatabase(db: SQLiteDatabase): Promise<void> {
  const already = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_state WHERE key = 'seed_v1_done'"
  );
  if (already) return;

  for (const ex of ALL_EXERCISES) {
    const exists = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [ex.name]
    );
    if (!exists) {
      await db.runAsync(
        'INSERT INTO exercises (name, description, tips, image_path, muscle_group) VALUES (?, ?, ?, ?, ?)',
        [ex.name, '', ex.tips, null, ex.muscle_group ?? null]
      );
    }
  }

  for (let wi = 0; wi < SEED_WORKOUTS.length; wi++) {
    const w = SEED_WORKOUTS[wi];
    const result = await db.runAsync(
      'INSERT INTO workouts (name, order_index) VALUES (?, ?)',
      [w.name, wi]
    );
    const workoutId = result.lastInsertRowId;

    for (let ei = 0; ei < w.exercises.length; ei++) {
      const we = w.exercises[ei];
      const exercise = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?)', [we.exerciseName]
      );
      if (!exercise) {
        console.warn(`[seed] Exercício não encontrado: ${we.exerciseName}`);
        continue;
      }
      await db.runAsync(
        'INSERT INTO workout_exercises (workout_id, exercise_id, sets, reps, rest_seconds, position) VALUES (?, ?, ?, ?, ?, ?)',
        [workoutId, exercise.id, we.sets, we.reps, we.restSeconds, ei]
      );
    }
  }

  await db.runAsync(
    "INSERT OR REPLACE INTO app_state (key, value) VALUES ('seed_v1_done', '1')"
  );

  console.log('[seed] Banco populado: exercícios + 3 treinos');
}
