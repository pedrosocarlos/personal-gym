export const MUSCLE_GROUPS = [
  'Peito',
  'Costas',
  'Ombro',
  'Bíceps',
  'Tríceps',
  'Abdômen',
  'Quadríceps',
  'Posterior',
  'Glúteo',
  'Panturrilha',
  'Antebraço',
  'Trapézio',
  'Cardio',
  'Full Body',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// Muscles that fatigue quickly and act as synergists in compound movements.
// Placing two consecutive SMALL_MUSCLES risks pre-fatiguing synergists before
// the heavier compound lifts — physiologist-validated classification.
export const SMALL_MUSCLES = new Set<string>([
  'Bíceps',
  'Tríceps',
  'Antebraço',
  'Panturrilha',
  'Abdômen',
]);

// If the PREVIOUS exercise worked the key muscle, alert when CURRENT works any
// muscle in the value array — synergist pre-fatigue pattern (NSCA/ACSM guideline).
export const SYNERGIST_CONFLICTS: Partial<Record<string, string[]>> = {
  Bíceps: ['Costas'],          // biceps are primary synergists for all rowing/pull movements
  Tríceps: ['Peito', 'Ombro'], // triceps are primary synergists for all pressing movements
  Ombro: ['Peito'],            // anterior deltoid overlaps heavily with horizontal press mechanics
};

// ─── Domain types ────────────────────────────────────────────────────────────

export type RepType = 'fixed' | 'descending' | 'dropset';

export interface Exercise {
  id: number;
  name: string;
  description: string;
  tips: string;
  image_path: string | null;
  muscle_group: string | null;
  created_at: number;
}

export interface Workout {
  id: number;
  name: string;
  order_index: number;
  created_at: number;
}

export interface WorkoutExercise {
  id: number;
  workout_id: number;
  exercise_id: number;
  sets: number;
  reps: number;
  rest_seconds: number;
  position: number;
  rep_type: RepType;
  reps_per_set: string | null;   // JSON number array — used when rep_type = 'descending'
  drop_reduction_pct: number | null; // % load reduction per drop — used when rep_type = 'dropset'
}

export interface WorkoutExerciseWithDetails extends WorkoutExercise {
  exercise_name: string;
  exercise_image: string | null;
  exercise_description: string;
  exercise_tips: string;
  exercise_muscle_group: string | null;
}

export interface BodyRecord {
  id: number;
  date: string;           // YYYY-MM-DD
  weight_kg: number | null;
  body_fat_pct: number | null;
  created_at: number;
}

export interface ExerciseLog {
  id: number;
  exercise_id: number;
  date: string;
  weight_used_kg: number | null;
  notes: string | null;
  created_at: number;
}
