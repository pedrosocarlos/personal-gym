import type { SQLiteDatabase } from 'expo-sqlite';
import type { BodyRecord, Exercise, ExerciseLog, RepType, Workout, WorkoutExerciseWithDetails } from '../types';
import { seedDatabase } from './seed';

export async function initDb(db: SQLiteDatabase): Promise<void> {
  // Core tables
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tips TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      sets INTEGER NOT NULL DEFAULT 3,
      reps INTEGER NOT NULL DEFAULT 10,
      rest_seconds INTEGER NOT NULL DEFAULT 60,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO app_state (key, value) VALUES ('current_workout_index', '0');
  `);

  // ── Migration: add muscle_group column ───────────────────────────────────
  try {
    await db.execAsync("ALTER TABLE exercises ADD COLUMN muscle_group TEXT DEFAULT 'Full Body';");
  } catch { /* already exists */ }

  // ── Migration: rep type columns on workout_exercises ─────────────────────
  for (const sql of [
    "ALTER TABLE workout_exercises ADD COLUMN rep_type TEXT NOT NULL DEFAULT 'fixed';",
    'ALTER TABLE workout_exercises ADD COLUMN reps_per_set TEXT;',
    'ALTER TABLE workout_exercises ADD COLUMN drop_reduction_pct INTEGER;',
  ]) {
    try { await db.execAsync(sql); } catch { /* already exists */ }
  }

  // ── Feature tables ────────────────────────────────────────────────────────
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS body_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL,
      body_fat_pct REAL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS exercise_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      weight_used_kg REAL,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_logs_exercise
      ON exercise_logs (exercise_id, date DESC);

    CREATE INDEX IF NOT EXISTS idx_body_records_date
      ON body_records (date ASC);
  `);

  await seedDatabase(db);
}

// ─── Exercises ───────────────────────────────────────────────────────────────

export async function getExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>('SELECT * FROM exercises ORDER BY name ASC');
}

export async function createExercise(
  db: SQLiteDatabase,
  data: Pick<Exercise, 'name' | 'description' | 'tips' | 'image_path' | 'muscle_group'>
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO exercises (name, description, tips, image_path, muscle_group) VALUES (?, ?, ?, ?, ?)',
    [data.name, data.description, data.tips, data.image_path ?? null, data.muscle_group ?? 'Full Body']
  );
  return result.lastInsertRowId;
}

export async function updateExercise(
  db: SQLiteDatabase,
  id: number,
  data: Pick<Exercise, 'name' | 'description' | 'tips' | 'image_path' | 'muscle_group'>
): Promise<void> {
  await db.runAsync(
    'UPDATE exercises SET name=?, description=?, tips=?, image_path=?, muscle_group=? WHERE id=?',
    [data.name, data.description, data.tips, data.image_path ?? null, data.muscle_group ?? 'Full Body', id]
  );
}

export async function deleteExercise(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM exercises WHERE id=?', [id]);
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export async function getWorkouts(db: SQLiteDatabase): Promise<Workout[]> {
  return db.getAllAsync<Workout>('SELECT * FROM workouts ORDER BY order_index ASC');
}

export async function createWorkout(db: SQLiteDatabase, name: string): Promise<number> {
  const row = await db.getFirstAsync<{ max_order: number }>(
    'SELECT COALESCE(MAX(order_index), -1) as max_order FROM workouts'
  );
  const nextOrder = (row?.max_order ?? -1) + 1;
  const result = await db.runAsync(
    'INSERT INTO workouts (name, order_index) VALUES (?, ?)',
    [name, nextOrder]
  );
  return result.lastInsertRowId;
}

export async function deleteWorkout(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM workouts WHERE id=?', [id]);
}

// ─── Workout Exercises ────────────────────────────────────────────────────────

export async function getWorkoutExercises(
  db: SQLiteDatabase,
  workoutId: number
): Promise<WorkoutExerciseWithDetails[]> {
  return db.getAllAsync<WorkoutExerciseWithDetails>(
    `SELECT we.*,
            e.name         AS exercise_name,
            e.image_path   AS exercise_image,
            e.description  AS exercise_description,
            e.tips         AS exercise_tips,
            e.muscle_group AS exercise_muscle_group
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_id = ?
     ORDER BY we.position ASC`,
    [workoutId]
  );
}

export async function addExerciseToWorkout(
  db: SQLiteDatabase,
  workoutId: number,
  exerciseId: number,
  sets: number,
  reps: number,
  restSeconds: number,
  repType: RepType = 'fixed',
  repsPerSet: string | null = null,
  dropReductionPct: number | null = null,
): Promise<void> {
  const row = await db.getFirstAsync<{ max_pos: number }>(
    'SELECT COALESCE(MAX(position), -1) as max_pos FROM workout_exercises WHERE workout_id=?',
    [workoutId]
  );
  const nextPos = (row?.max_pos ?? -1) + 1;
  await db.runAsync(
    `INSERT INTO workout_exercises
       (workout_id, exercise_id, sets, reps, rest_seconds, position, rep_type, reps_per_set, drop_reduction_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [workoutId, exerciseId, sets, reps, restSeconds, nextPos, repType, repsPerSet, dropReductionPct]
  );
}

export async function updateWorkoutExercise(
  db: SQLiteDatabase,
  id: number,
  sets: number,
  reps: number,
  restSeconds: number,
  repType: RepType = 'fixed',
  repsPerSet: string | null = null,
  dropReductionPct: number | null = null,
): Promise<void> {
  await db.runAsync(
    'UPDATE workout_exercises SET sets=?, reps=?, rest_seconds=?, rep_type=?, reps_per_set=?, drop_reduction_pct=? WHERE id=?',
    [sets, reps, restSeconds, repType, repsPerSet, dropReductionPct, id]
  );
}

export async function removeExerciseFromWorkout(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  await db.runAsync('DELETE FROM workout_exercises WHERE id=?', [id]);
}

export async function reorderWorkoutExercises(
  db: SQLiteDatabase,
  orderedIds: number[]
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync(
        'UPDATE workout_exercises SET position=? WHERE id=?',
        [i, orderedIds[i]]
      );
    }
  });
}

// ─── App State (treino do dia) ────────────────────────────────────────────────

export async function getCurrentWorkout(db: SQLiteDatabase): Promise<Workout | null> {
  const workouts = await getWorkouts(db);
  if (workouts.length === 0) return null;
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_state WHERE key='current_workout_index'"
  );
  const idx = parseInt(row?.value ?? '0', 10);
  return workouts[idx % workouts.length];
}

export async function getWorkoutPosition(
  db: SQLiteDatabase
): Promise<{ current: number; total: number }> {
  const workouts = await getWorkouts(db);
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_state WHERE key='current_workout_index'"
  );
  const idx = parseInt(row?.value ?? '0', 10);
  return {
    current: workouts.length > 0 ? (idx % workouts.length) + 1 : 0,
    total: workouts.length,
  };
}

export async function advanceToNextWorkout(db: SQLiteDatabase): Promise<void> {
  const workouts = await getWorkouts(db);
  if (workouts.length === 0) return;
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_state WHERE key='current_workout_index'"
  );
  const current = parseInt(row?.value ?? '0', 10);
  const next = (current + 1) % workouts.length;
  await db.runAsync(
    "UPDATE app_state SET value=? WHERE key='current_workout_index'",
    [next.toString()]
  );
}

// ─── Body Records (Feature 1) ─────────────────────────────────────────────────

export async function getBodyRecords(db: SQLiteDatabase): Promise<BodyRecord[]> {
  return db.getAllAsync<BodyRecord>(
    'SELECT * FROM body_records ORDER BY date ASC, id ASC'
  );
}

export async function createBodyRecord(
  db: SQLiteDatabase,
  data: Pick<BodyRecord, 'date' | 'weight_kg' | 'body_fat_pct'>
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO body_records (date, weight_kg, body_fat_pct) VALUES (?, ?, ?)',
    [data.date, data.weight_kg ?? null, data.body_fat_pct ?? null]
  );
  return result.lastInsertRowId;
}

export async function deleteBodyRecord(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM body_records WHERE id=?', [id]);
}

export async function getLatestBodyStats(
  db: SQLiteDatabase
): Promise<{ latest_weight: number | null; latest_fat: number | null }> {
  const [wRow, fRow] = await Promise.all([
    db.getFirstAsync<{ weight_kg: number | null }>(
      'SELECT weight_kg FROM body_records WHERE weight_kg IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1'
    ),
    db.getFirstAsync<{ body_fat_pct: number | null }>(
      'SELECT body_fat_pct FROM body_records WHERE body_fat_pct IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1'
    ),
  ]);
  return {
    latest_weight: wRow?.weight_kg ?? null,
    latest_fat: fRow?.body_fat_pct ?? null,
  };
}

// ─── Exercise Logs (Feature 2) ────────────────────────────────────────────────

export async function logExerciseWeight(
  db: SQLiteDatabase,
  exerciseId: number,
  weightKg: number | null,
  notes: string | null = null
): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  await db.runAsync(
    'INSERT INTO exercise_logs (exercise_id, date, weight_used_kg, notes) VALUES (?, ?, ?, ?)',
    [exerciseId, date, weightKg, notes]
  );
}

export async function getLastExerciseLog(
  db: SQLiteDatabase,
  exerciseId: number
): Promise<ExerciseLog | null> {
  return db.getFirstAsync<ExerciseLog>(
    'SELECT * FROM exercise_logs WHERE exercise_id=? ORDER BY date DESC, id DESC LIMIT 1',
    [exerciseId]
  );
}

// Returns true if the last 3 weight-bearing sessions used the identical load.
export async function shouldSuggestProgressiveOverload(
  db: SQLiteDatabase,
  exerciseId: number
): Promise<boolean> {
  const rows = await db.getAllAsync<{ weight_used_kg: number }>(
    `SELECT weight_used_kg FROM exercise_logs
     WHERE exercise_id=? AND weight_used_kg IS NOT NULL
     ORDER BY date DESC, id DESC LIMIT 3`,
    [exerciseId]
  );
  if (rows.length < 3) return false;
  const w0 = rows[0].weight_used_kg;
  return rows.every((r) => r.weight_used_kg === w0);
}

// ─── Weekly Volume (Feature Extra) ───────────────────────────────────────────

export async function getWeeklyVolumeByMuscleGroup(
  db: SQLiteDatabase
): Promise<Array<{ muscle_group: string; count: number }>> {
  return db.getAllAsync<{ muscle_group: string; count: number }>(
    `SELECT COALESCE(e.muscle_group, 'Full Body') AS muscle_group,
            COUNT(*) AS count
     FROM exercise_logs el
     JOIN exercises e ON e.id = el.exercise_id
     WHERE el.created_at >= strftime('%s', 'now') - 7 * 24 * 60 * 60
     GROUP BY e.muscle_group
     ORDER BY count DESC`
  );
}
