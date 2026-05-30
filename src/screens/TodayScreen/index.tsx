import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  advanceToNextWorkout,
  getCurrentWorkout,
  getLastExerciseLog,
  getWorkoutExercises,
  getWorkoutPosition,
  logExerciseWeight,
  shouldSuggestProgressiveOverload,
} from '../../database';
import { SMALL_MUSCLES, SYNERGIST_CONFLICTS } from '../../types';
import type { ExerciseLog, Workout, WorkoutExerciseWithDetails } from '../../types';
import { colors, font, radius, spacing } from '../../theme';

type Phase = 'exercise' | 'rest' | 'done';

export default function TodayScreen() {
  const db = useSQLiteContext();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<WorkoutExerciseWithDetails[]>([]);
  const [position, setPosition] = useState({ current: 0, total: 0 });

  // Session progress — reset only when workout changes
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [setsDone, setSetsDone] = useState(0);
  const [phase, setPhase] = useState<Phase>('exercise');
  const [restLeft, setRestLeft] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Per-exercise data
  const [lastLog, setLastLog] = useState<ExerciseLog | null>(null);
  const [showOverloadHint, setShowOverloadHint] = useState(false);

  // Weight log modal
  const [weightModal, setWeightModal] = useState({ visible: false, kg: '' });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedWorkoutIdRef = useRef<number | null>(null);

  // ── Load workout data (preserve progress unless workout changed) ──────────
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function doLoad() {
        const [w, pos] = await Promise.all([
          getCurrentWorkout(db),
          getWorkoutPosition(db),
        ]);
        if (cancelled) return;
        setPosition(pos);
        setWorkout(w);
        if (!w) {
          setExercises([]);
          loadedWorkoutIdRef.current = null;
          setExerciseIdx(0); setSetsDone(0); setPhase('exercise');
          return;
        }
        const exs = await getWorkoutExercises(db, w.id);
        if (cancelled) return;
        setExercises(exs);
        if (w.id !== loadedWorkoutIdRef.current) {
          loadedWorkoutIdRef.current = w.id;
          setExerciseIdx(0); setSetsDone(0);
          setPhase('exercise'); setExpanded(false);
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        }
      }
      doLoad();
      return () => { cancelled = true; };
    }, [db])
  );

  // ── Load per-exercise metadata when exerciseIdx changes ──────────────────
  useEffect(() => {
    const ex = exercises[exerciseIdx];
    if (!ex) return;
    let active = true;
    Promise.all([
      getLastExerciseLog(db, ex.exercise_id),
      shouldSuggestProgressiveOverload(db, ex.exercise_id),
    ]).then(([log, suggest]) => {
      if (!active) return;
      setLastLog(log);
      setShowOverloadHint(suggest);
    });
    return () => { active = false; };
  }, [exerciseIdx, exercises, db]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Rest timer ───────────────────────────────────────────────────────────
  const startRest = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestLeft(seconds);
    setPhase('rest');
    timerRef.current = setInterval(() => {
      setRestLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setPhase('exercise');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Mark series ──────────────────────────────────────────────────────────
  const handleMarkSet = () => {
    const current = exercises[exerciseIdx];
    if (!current) return;

    const newSetsDone = setsDone + 1;
    const isLastSet = newSetsDone >= current.sets;
    const isLastExercise = exerciseIdx + 1 >= exercises.length;

    if (isLastSet && isLastExercise) {
      setWeightModal({ visible: true, kg: lastLog?.weight_used_kg?.toString() ?? '' });
      setSetsDone(newSetsDone);
      setPhase('done');
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    } else if (isLastSet) {
      setWeightModal({ visible: true, kg: lastLog?.weight_used_kg?.toString() ?? '' });
      setSetsDone(0);
      setExerciseIdx((i) => i + 1);
      setExpanded(false);
      startRest(current.rest_seconds);
    } else {
      setSetsDone(newSetsDone);
      startRest(current.rest_seconds);
    }
  };

  const handleSkipRest = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase('exercise');
    setRestLeft(0);
  };

  // ── Log weight (optional — called from modal) ─────────────────────────────
  const handleLogWeight = async (skipLog = false) => {
    const exerciseId =
      phase === 'done'
        ? exercises[exercises.length - 1]?.exercise_id
        : exercises[exerciseIdx - 1]?.exercise_id;

    if (!skipLog && exerciseId !== undefined) {
      const kg = parseFloat(weightModal.kg.replace(',', '.'));
      if (!isNaN(kg) && kg > 0) {
        await logExerciseWeight(db, exerciseId, kg, null);
      }
    }
    setWeightModal({ visible: false, kg: '' });
  };

  // ── Finish workout ────────────────────────────────────────────────────────
  const handleFinish = async () => {
    await advanceToNextWorkout(db);
    loadedWorkoutIdRef.current = null;
    const [w, pos] = await Promise.all([getCurrentWorkout(db), getWorkoutPosition(db)]);
    setPosition(pos);
    setWorkout(w);
    if (w) {
      const exs = await getWorkoutExercises(db, w.id);
      setExercises(exs);
      loadedWorkoutIdRef.current = w.id;
    } else {
      setExercises([]);
    }
    setExerciseIdx(0); setSetsDone(0); setPhase('exercise'); setExpanded(false);
  };

  // ── Derived: muscle conflict warnings ────────────────────────────────────
  const current = exercises[exerciseIdx];
  const prevEx = exerciseIdx > 0 ? exercises[exerciseIdx - 1] : null;
  const currentMuscle = current?.exercise_muscle_group ?? '';
  const prevMuscle = prevEx?.exercise_muscle_group ?? '';
  const isSameSmall =
    SMALL_MUSCLES.has(currentMuscle) &&
    SMALL_MUSCLES.has(prevMuscle) &&
    currentMuscle === prevMuscle;
  const isSynergist =
    !!prevMuscle &&
    ((SYNERGIST_CONFLICTS as Record<string, string[]>)[prevMuscle] ?? []).includes(currentMuscle);
  const muscleWarning = isSameSmall
    ? `Dois ${currentMuscle} consecutivos — considere alternar com um músculo maior.`
    : isSynergist
    ? `${prevMuscle} pré-fadigado pode limitar o desempenho em ${currentMuscle}.`
    : null;

  // ─────────────────────────────────────────────────────────────────────────

  if (!workout || exercises.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="today-outline" size={72} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Nenhum treino configurado</Text>
        <Text style={styles.emptySubtitle}>
          Vá para a aba Treinos, crie um treino e adicione exercícios. Eles aparecem aqui automaticamente.
        </Text>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <>
        <View style={styles.doneState}>
          <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          <Text style={styles.doneTitle}>Treino Concluído!</Text>
          <Text style={styles.doneSubtitle}>{workout.name}</Text>
          <Text style={styles.doneNext}>
            Próximo: Treino{' '}
            {position.current === position.total ? 1 : position.current + 1}/{position.total}
          </Text>
          <TouchableOpacity
            style={styles.finishBtn}
            onPress={handleFinish}
            accessibilityLabel="Avançar para o próximo treino"
            accessibilityRole="button"
          >
            <Text style={styles.finishBtnText}>Avançar para o Próximo</Text>
          </TouchableOpacity>
        </View>
        <WeightModal
          visible={weightModal.visible}
          kg={weightModal.kg}
          exerciseName={exercises[exercises.length - 1]?.exercise_name ?? ''}
          onChange={(v) => setWeightModal((m) => ({ ...m, kg: v }))}
          onSave={() => handleLogWeight(false)}
          onSkip={() => handleLogWeight(true)}
        />
      </>
    );
  }

  if (!current) return null;

  const progressPct = (exerciseIdx / exercises.length) * 100;
  const markBtnLabel =
    setsDone + 1 >= current.sets && exerciseIdx + 1 >= exercises.length
      ? 'Concluir Treino'
      : setsDone + 1 >= current.sets
      ? 'Próximo Exercício'
      : `Marcar Série ${setsDone + 1}`;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>TREINO DO DIA</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>{workout.name}</Text>
          </View>
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>{position.current}/{position.total}</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressLabel}>Exercício {exerciseIdx + 1} de {exercises.length}</Text>

        {/* Muscle conflict warning */}
        {muscleWarning && phase === 'exercise' && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.warningText}>{muscleWarning}</Text>
          </View>
        )}

        {/* Progressive overload hint */}
        {showOverloadHint && phase === 'exercise' && (
          <View style={styles.hintBanner}>
            <Ionicons name="trending-up-outline" size={16} color={colors.primary} />
            <Text style={styles.hintText}>
              Mesmo peso nas últimas 3 sessões — tente aumentar a carga!
            </Text>
          </View>
        )}

        {/* Rest phase */}
        {phase === 'rest' && (
          <View style={styles.restCard}>
            <Ionicons name="time-outline" size={40} color={colors.warning} />
            <Text style={styles.restTitle}>Descanso</Text>
            <Text style={styles.restTimer}>{restLeft}s</Text>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkipRest}
              accessibilityLabel="Pular descanso"
              accessibilityRole="button"
            >
              <Text style={styles.skipBtnText}>Pular Descanso</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Exercise card */}
        {phase === 'exercise' && (
          <>
            <View style={styles.exerciseCard}>
              {current.exercise_image ? (
                <Image
                  source={{ uri: current.exercise_image }}
                  style={styles.exerciseImage}
                  accessibilityLabel={current.exercise_name}
                />
              ) : (
                <View style={styles.exerciseImagePlaceholder}>
                  <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.exerciseBody}>
                <Text style={styles.exerciseName}>{current.exercise_name}</Text>
                {/* Muscle group chip */}
                {current.exercise_muscle_group ? (
                  <View style={styles.muscleChipRow}>
                    <Text style={styles.muscleChip}>{current.exercise_muscle_group}</Text>
                  </View>
                ) : null}
                {/* Last session reference */}
                {lastLog?.weight_used_kg !== undefined && lastLog.weight_used_kg !== null ? (
                  <Text style={styles.lastWeight}>
                    Última sessão: {lastLog.weight_used_kg} kg
                  </Text>
                ) : null}
                <View style={styles.exerciseStats}>
                  <Stat icon="repeat-outline" value={`${current.sets} séries`} />
                  <Stat icon="fitness-outline" value={`${current.reps} reps`} />
                  <Stat icon="time-outline" value={`${current.rest_seconds}s rest`} />
                </View>
              </View>
            </View>

            {/* Sets dots */}
            <View style={styles.setsContainer}>
              <Text style={styles.setsLabel}>Série {setsDone + 1} de {current.sets}</Text>
              <View style={styles.setsDots}>
                {Array.from({ length: Math.min(current.sets, 20) }).map((_, i) => (
                  <View key={i} style={[styles.dot, i < setsDone && styles.dotDone]} />
                ))}
              </View>
            </View>

            {/* Description toggle */}
            {(current.exercise_description || current.exercise_tips) ? (
              <Pressable
                style={styles.expandBtn}
                onPress={() => setExpanded((e) => !e)}
                accessibilityLabel={expanded ? 'Ocultar detalhes' : 'Ver descrição e dicas'}
                accessibilityRole="button"
              >
                <Text style={styles.expandBtnText}>
                  {expanded ? 'Ocultar detalhes' : 'Ver descrição e dicas'}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.primary}
                />
              </Pressable>
            ) : null}

            {expanded && (
              <View style={styles.details}>
                {current.exercise_description ? (
                  <>
                    <Text style={styles.detailsLabel}>Como executar</Text>
                    <Text style={styles.detailsText}>{current.exercise_description}</Text>
                  </>
                ) : null}
                {current.exercise_tips ? (
                  <>
                    <Text style={[styles.detailsLabel, { marginTop: spacing.md }]}>Dicas</Text>
                    <Text style={styles.detailsText}>{current.exercise_tips}</Text>
                  </>
                ) : null}
              </View>
            )}

            {/* Mark set */}
            <TouchableOpacity
              style={styles.markBtn}
              onPress={handleMarkSet}
              accessibilityLabel={markBtnLabel}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.markBtnText}>{markBtnLabel}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Weight log modal — appears after last set of each exercise */}
      <WeightModal
        visible={weightModal.visible}
        kg={weightModal.kg}
        exerciseName={
          phase === 'done'
            ? exercises[exercises.length - 1]?.exercise_name ?? ''
            : exercises[exerciseIdx - 1]?.exercise_name ?? current.exercise_name
        }
        onChange={(v) => setWeightModal((m) => ({ ...m, kg: v }))}
        onSave={() => handleLogWeight(false)}
        onSkip={() => handleLogWeight(true)}
      />
    </>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function WeightModal({
  visible,
  kg,
  exerciseName,
  onChange,
  onSave,
  onSkip,
}: {
  visible: boolean;
  kg: string;
  exerciseName: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={wStyles.overlay} onPress={onSkip}>
        <Pressable style={wStyles.modal} onPress={() => {}}>
          <Text style={wStyles.title}>Registrar Carga</Text>
          <Text style={wStyles.subtitle}>{exerciseName}</Text>
          <TextInput
            style={wStyles.input}
            value={kg}
            onChangeText={onChange}
            placeholder="Ex: 80"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            autoFocus
            accessibilityLabel="Peso utilizado em kg"
          />
          <Text style={wStyles.unit}>kg</Text>
          <View style={wStyles.actions}>
            <TouchableOpacity
              style={wStyles.skipBtn}
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Pular registro de carga"
            >
              <Text style={wStyles.skipText}>Pular</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={wStyles.saveBtn}
              onPress={onSave}
              accessibilityRole="button"
              accessibilityLabel="Salvar carga"
            >
              <Text style={wStyles.saveText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
}) {
  return (
    <View style={statStyles.container}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={statStyles.text}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { color: colors.textSecondary, fontSize: font.sm },
});

const wStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: font.md, textAlign: 'center' },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    width: 160,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  unit: { color: colors.textMuted, fontSize: font.md },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    width: '100%',
  },
  skipBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  skipText: { color: colors.textSecondary, fontSize: font.md },
  saveBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerLabel: { color: colors.primary, fontSize: font.sm, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginTop: 2 },
  positionBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  positionText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },
  progressBar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  progressLabel: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: -spacing.xs },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warning + '22',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  warningText: { flex: 1, color: colors.warning, fontSize: font.sm, lineHeight: 18 },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primary + '22',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  hintText: { flex: 1, color: colors.primary, fontSize: font.sm, lineHeight: 18 },
  restCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning + '44',
  },
  restTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  restTimer: { color: colors.warning, fontSize: 56, fontWeight: '800' },
  skipBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipBtnText: { color: colors.textSecondary, fontSize: font.sm },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  exerciseImage: { width: '100%', height: 200 },
  exerciseImagePlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseBody: { padding: spacing.md, gap: spacing.sm },
  exerciseName: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  muscleChipRow: { flexDirection: 'row' },
  muscleChip: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  lastWeight: {
    color: colors.textSecondary,
    fontSize: font.sm,
    fontStyle: 'italic',
  },
  exerciseStats: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  setsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  setsLabel: { color: colors.textSecondary, fontSize: font.md, fontWeight: '600' },
  setsDots: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  dotDone: { backgroundColor: colors.success },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  expandBtnText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  details: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailsLabel: { color: colors.primary, fontSize: font.sm, fontWeight: '700' },
  detailsText: { color: colors.textSecondary, fontSize: font.md, lineHeight: 22 },
  markBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  markBtnText: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: font.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  doneState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  doneTitle: { color: colors.text, fontSize: font.xxl, fontWeight: '800' },
  doneSubtitle: { color: colors.textSecondary, fontSize: font.lg },
  doneNext: {
    color: colors.primary,
    fontSize: font.md,
    fontWeight: '600',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  finishBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  finishBtnText: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
});
