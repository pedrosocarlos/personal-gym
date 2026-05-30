import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
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
  getExercises,
  getLastExerciseLog,
  getWorkoutExercises,
  getWorkouts,
  getWorkoutPosition,
  logExerciseWeight,
  shouldSuggestProgressiveOverload,
} from '../../database';
import { SMALL_MUSCLES, SYNERGIST_CONFLICTS } from '../../types';
import type { Exercise, ExerciseLog, Workout, WorkoutExerciseWithDetails } from '../../types';
import { colors, font, radius, spacing } from '../../theme';

type Phase = 'exercise' | 'rest' | 'done';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRepsForSet(ex: WorkoutExerciseWithDetails, setIdx: number): number {
  if (ex.rep_type === 'descending' && ex.reps_per_set) {
    try {
      const arr = JSON.parse(ex.reps_per_set) as number[];
      return arr[setIdx] ?? ex.reps;
    } catch { return ex.reps; }
  }
  return ex.reps;
}

function getDropWeight(base: number, pct: number, dropIdx: number): number {
  return Math.round(base * Math.pow(1 - pct / 100, dropIdx) * 2) / 2;
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const pendingSkippedReviewRef = useRef(false);

  // ── Feature 1: manual workout selection ──────────────────────────────────
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  const [workoutPickerVisible, setWorkoutPickerVisible] = useState(false);
  const [sessionWorkout, setSessionWorkout] = useState<Workout | null>(null);

  // ── Feature 2: skip + substitute ─────────────────────────────────────────
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());
  const [skippedReviewVisible, setSkippedReviewVisible] = useState(false);
  const [substituteVisible, setSubstituteVisible] = useState(false);
  const [substituteOptions, setSubstituteOptions] = useState<Exercise[]>([]);
  const [finalSkippedCount, setFinalSkippedCount] = useState(0);

  // Session timer
  const sessionStartRef = useRef<number>(Date.now());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedWorkoutIdRef = useRef<number | null>(null);

  const effectiveWorkout = sessionWorkout ?? workout;

  // ── Load workout data ────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function doLoad() {
        const [w, pos, ws] = await Promise.all([
          getCurrentWorkout(db),
          getWorkoutPosition(db),
          getWorkouts(db),
        ]);
        if (cancelled) return;
        setPosition(pos);
        setWorkout(w);
        setAllWorkouts(ws);
        if (!w) {
          setExercises([]);
          loadedWorkoutIdRef.current = null;
          setExerciseIdx(0); setSetsDone(0); setPhase('exercise');
          return;
        }
        const targetId = sessionWorkout?.id ?? w.id;
        const exs = await getWorkoutExercises(db, targetId);
        if (cancelled) return;
        setExercises(exs);
        if (targetId !== loadedWorkoutIdRef.current) {
          loadedWorkoutIdRef.current = targetId;
          setExerciseIdx(0); setSetsDone(0);
          setPhase('exercise'); setExpanded(false);
          setSkippedIds(new Set()); setFinalSkippedCount(0);
          sessionStartRef.current = Date.now();
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        }
      }
      doLoad();
      return () => { cancelled = true; };
    }, [db]) // intentionally exclude sessionWorkout to avoid mid-session reloads
  );

  // ── Per-exercise metadata ─────────────────────────────────────────────────
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
    const mainQueueEnd = exercises.length - skippedIds.size;
    const isLastMainExercise = exerciseIdx + 1 >= mainQueueEnd;
    const isInSkippedZone = exerciseIdx >= mainQueueEnd;
    const isLastExercise = exerciseIdx + 1 >= exercises.length;

    const lastLogKg = lastLog?.weight_used_kg?.toString() ?? '';

    if (isLastSet && isLastExercise) {
      setWeightModal({ visible: true, kg: lastLogKg });
      setSetsDone(newSetsDone);
      setPhase('done');
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    } else if (isLastSet && isLastMainExercise && !isInSkippedZone && skippedIds.size > 0) {
      setWeightModal({ visible: true, kg: lastLogKg });
      setSetsDone(0);
      setExerciseIdx((i) => i + 1);
      setExpanded(false);
      startRest(current.rest_seconds);
      pendingSkippedReviewRef.current = true;
    } else if (isLastSet) {
      setWeightModal({ visible: true, kg: lastLogKg });
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

  // ── Log weight ────────────────────────────────────────────────────────────
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
    if (pendingSkippedReviewRef.current) {
      pendingSkippedReviewRef.current = false;
      setSkippedReviewVisible(true);
    }
  };

  // ── Finish workout ────────────────────────────────────────────────────────
  const handleFinish = async (skippedFinal = 0) => {
    setFinalSkippedCount(skippedFinal);
    await advanceToNextWorkout(db);
    setSessionWorkout(null);
    loadedWorkoutIdRef.current = null;
    setSkippedIds(new Set());
    setSkippedReviewVisible(false);
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

  // ── Feature 1: switch workout ─────────────────────────────────────────────
  const handleSwitchWorkout = async (newWorkout: Workout) => {
    setWorkoutPickerVisible(false);
    if (newWorkout.id === effectiveWorkout?.id) return;
    const exs = await getWorkoutExercises(db, newWorkout.id);
    setSessionWorkout(newWorkout);
    setExercises(exs);
    loadedWorkoutIdRef.current = newWorkout.id;
    setExerciseIdx(0); setSetsDone(0); setPhase('exercise'); setExpanded(false);
    setSkippedIds(new Set()); setFinalSkippedCount(0);
    setSkippedReviewVisible(false);
    sessionStartRef.current = Date.now();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ── Feature 2: skip exercise ──────────────────────────────────────────────
  const handleSkipExercise = () => {
    const current = exercises[exerciseIdx];
    if (!current || skippedIds.has(current.id)) return;
    const newSkipped = new Set(skippedIds);
    newSkipped.add(current.id);
    setSkippedIds(newSkipped);
    const next = [...exercises];
    const [moved] = next.splice(exerciseIdx, 1);
    next.push(moved);
    setExercises(next);
    setSetsDone(0);
  };

  // ── Feature 2: substitute exercise ───────────────────────────────────────
  const handleOpenSubstitute = async () => {
    const current = exercises[exerciseIdx];
    if (!current) return;
    const all = await getExercises(db);
    const inWorkout = new Set(exercises.map((e) => e.exercise_id));
    const sameMuscle = all.filter(
      (e) => e.muscle_group === current.exercise_muscle_group && !inWorkout.has(e.id)
    );
    setSubstituteOptions(
      sameMuscle.length > 0 ? sameMuscle : all.filter((e) => !inWorkout.has(e.id))
    );
    setSubstituteVisible(true);
  };

  const handleSubstitute = (exercise: Exercise) => {
    const next = [...exercises];
    next[exerciseIdx] = {
      ...next[exerciseIdx],
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_image: exercise.image_path,
      exercise_description: exercise.description,
      exercise_tips: exercise.tips,
      exercise_muscle_group: exercise.muscle_group,
    };
    setExercises(next);
    setSubstituteVisible(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const current = exercises[exerciseIdx];
  const prevEx = exerciseIdx > 0 ? exercises[exerciseIdx - 1] : null;
  const currentMuscle = current?.exercise_muscle_group ?? '';
  const prevMuscle = prevEx?.exercise_muscle_group ?? '';
  const isSameSmall =
    SMALL_MUSCLES.has(currentMuscle) && SMALL_MUSCLES.has(prevMuscle) && currentMuscle === prevMuscle;
  const isSynergist =
    !!prevMuscle &&
    ((SYNERGIST_CONFLICTS as Record<string, string[]>)[prevMuscle] ?? []).includes(currentMuscle);
  const muscleWarning = isSameSmall
    ? `Dois ${currentMuscle} consecutivos — considere alternar com um músculo maior.`
    : isSynergist
    ? `${prevMuscle} pré-fadigado pode limitar o desempenho em ${currentMuscle}.`
    : null;

  const isSkippedExercise = current && skippedIds.has(current.id);
  const mainQueueEnd = exercises.length - skippedIds.size;

  // ─────────────────────────────────────────────────────────────────────────

  if (!effectiveWorkout || exercises.length === 0) {
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
    const durationMs = Date.now() - sessionStartRef.current;
    const doneCount = exercises.length - finalSkippedCount;
    return (
      <>
        <View style={styles.doneState}>
          <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          <Text style={styles.doneTitle}>Treino Concluído!</Text>
          <Text style={styles.doneSubtitle}>{effectiveWorkout.name}</Text>
          <View style={styles.doneSummaryRow}>
            <SummaryChip icon="time-outline" label={fmtDuration(durationMs)} />
            <SummaryChip icon="checkmark-done-outline" label={`${doneCount} exerc.`} />
            {finalSkippedCount > 0 && (
              <SummaryChip icon="play-skip-forward-outline" label={`${finalSkippedCount} pulado`} color={colors.warning} />
            )}
          </View>
          <Text style={styles.doneNext}>
            Próximo: Treino{' '}
            {position.current === position.total ? 1 : position.current + 1}/{position.total}
          </Text>
          <TouchableOpacity style={styles.finishBtn} onPress={() => handleFinish(0)}>
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
  const repType = current.rep_type ?? 'fixed';
  const currentSetReps = getRepsForSet(current, setsDone);
  const isDropSet = repType === 'dropset';
  const markBtnLabel =
    setsDone + 1 >= current.sets && exerciseIdx + 1 >= exercises.length
      ? 'Concluir Treino'
      : setsDone + 1 >= current.sets
      ? 'Próximo Exercício'
      : isDropSet
      ? `Marcar Drop ${setsDone + 1}`
      : `Marcar Série ${setsDone + 1}`;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>TREINO DO DIA</Text>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle} numberOfLines={2}>{effectiveWorkout.name}</Text>
              {sessionWorkout && (
                <View style={styles.overrideBadge}>
                  <Text style={styles.overrideBadgeText}>MANUAL</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => setWorkoutPickerVisible(true)}
              accessibilityLabel="Trocar treino"
            >
              <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.positionBadge}>
              <Text style={styles.positionText}>{position.current}/{position.total}</Text>
            </View>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {isSkippedExercise ? '⏭ Exercício pulado — ' : ''}
          Exercício {exerciseIdx + 1} de {exercises.length}
          {skippedIds.size > 0 && exerciseIdx < mainQueueEnd
            ? ` · ${skippedIds.size} pulado${skippedIds.size > 1 ? 's' : ''} no final`
            : ''}
        </Text>

        {/* Skipped zone banner */}
        {isSkippedExercise && (
          <View style={styles.skippedBanner}>
            <Ionicons name="play-skip-forward-outline" size={16} color={colors.warning} />
            <Text style={styles.skippedBannerText}>Exercício anteriormente pulado</Text>
          </View>
        )}

        {/* Muscle conflict warning */}
        {muscleWarning && phase === 'exercise' && !isSkippedExercise && (
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
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkipRest}>
              <Text style={styles.skipBtnText}>Pular Descanso</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Exercise card */}
        {phase === 'exercise' && (
          <>
            <View style={styles.exerciseCard}>
              {current.exercise_image ? (
                <Image source={{ uri: current.exercise_image }} style={styles.exerciseImage} />
              ) : (
                <View style={styles.exerciseImagePlaceholder}>
                  <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.exerciseBody}>
                <View style={styles.exerciseNameRow}>
                  <Text style={styles.exerciseName}>{current.exercise_name}</Text>
                  {isDropSet && (
                    <View style={styles.dropBadge}>
                      <Text style={styles.dropBadgeText}>DROP SET</Text>
                    </View>
                  )}
                  {repType === 'descending' && (
                    <View style={[styles.dropBadge, { backgroundColor: colors.primary + '22' }]}>
                      <Text style={[styles.dropBadgeText, { color: colors.primary }]}>DECRESCENTE</Text>
                    </View>
                  )}
                </View>

                {current.exercise_muscle_group ? (
                  <View style={styles.muscleChipRow}>
                    <Text style={styles.muscleChip}>{current.exercise_muscle_group}</Text>
                  </View>
                ) : null}

                {lastLog?.weight_used_kg != null ? (
                  <Text style={styles.lastWeight}>Última sessão: {lastLog.weight_used_kg} kg</Text>
                ) : null}

                <View style={styles.exerciseStats}>
                  <Stat
                    icon="repeat-outline"
                    value={isDropSet ? `${current.sets} drops` : `${current.sets} séries`}
                  />
                  <Stat
                    icon="fitness-outline"
                    value={repType === 'descending' ? `${currentSetReps} reps` : isDropSet ? `${current.reps} reps/drop` : `${current.reps} reps`}
                  />
                  <Stat icon="time-outline" value={`${current.rest_seconds}s rest`} />
                </View>

                {/* Drop set weight suggestions */}
                {isDropSet && lastLog?.weight_used_kg != null && (
                  <View style={styles.dropWeights}>
                    {Array.from({ length: current.sets }).map((_, i) => (
                      <Text key={i} style={[styles.dropWeightItem, i === setsDone && styles.dropWeightActive]}>
                        {i + 1}→ {getDropWeight(lastLog.weight_used_kg!, current.drop_reduction_pct ?? 20, i)} kg
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Sets dots */}
            <View style={styles.setsContainer}>
              <Text style={styles.setsLabel}>
                {isDropSet ? `Drop ${setsDone + 1} de ${current.sets}` : `Série ${setsDone + 1} de ${current.sets}`}
                {repType === 'descending' ? ` · ${currentSetReps} reps` : ''}
              </Text>
              <View style={styles.setsDots}>
                {Array.from({ length: Math.min(current.sets, 20) }).map((_, i) => (
                  <View key={i} style={[styles.dot, i < setsDone && styles.dotDone]} />
                ))}
              </View>
            </View>

            {/* Description toggle */}
            {(current.exercise_description || current.exercise_tips) ? (
              <Pressable style={styles.expandBtn} onPress={() => setExpanded((e) => !e)}>
                <Text style={styles.expandBtnText}>
                  {expanded ? 'Ocultar detalhes' : 'Ver descrição e dicas'}
                </Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
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
            <TouchableOpacity style={styles.markBtn} onPress={handleMarkSet}>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.markBtnText}>{markBtnLabel}</Text>
            </TouchableOpacity>

            {/* Secondary actions: skip + substitute */}
            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, skippedIds.has(current.id) && styles.secondaryBtnDisabled]}
                onPress={handleSkipExercise}
                disabled={skippedIds.has(current.id)}
              >
                <Ionicons name="play-skip-forward-outline" size={14} color={skippedIds.has(current.id) ? colors.textMuted : colors.textSecondary} />
                <Text style={[styles.secondaryBtnText, skippedIds.has(current.id) && { color: colors.textMuted }]}>
                  {skippedIds.has(current.id) ? 'Já pulado' : 'Pular'}
                </Text>
              </TouchableOpacity>
              <View style={styles.secondarySeparator} />
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleOpenSubstitute}>
                <Ionicons name="swap-horizontal-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.secondaryBtnText}>Substituir</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Weight log modal */}
      <WeightModal
        visible={weightModal.visible}
        kg={weightModal.kg}
        exerciseName={exercises[exerciseIdx - 1]?.exercise_name ?? current.exercise_name}
        onChange={(v) => setWeightModal((m) => ({ ...m, kg: v }))}
        onSave={() => handleLogWeight(false)}
        onSkip={() => handleLogWeight(true)}
      />

      {/* Feature 1: workout picker */}
      <Modal visible={workoutPickerVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={() => setWorkoutPickerVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Trocar Treino</Text>
              <Text style={styles.sheetSubtitle}>Apenas para esta sessão</Text>
              <TouchableOpacity onPress={() => setWorkoutPickerVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {allWorkouts.map((w) => {
              const isActive = w.id === effectiveWorkout?.id;
              return (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.workoutOption, isActive && styles.workoutOptionActive]}
                  onPress={() => handleSwitchWorkout(w)}
                >
                  <Ionicons
                    name={isActive ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={isActive ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.workoutOptionText, isActive && { color: colors.primary }]}>
                    {w.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feature 2: skipped exercises review */}
      <Modal visible={skippedReviewVisible} transparent animationType="fade">
        <Pressable style={styles.centeredOverlay} onPress={() => {}}>
          <View style={styles.reviewModal}>
            <Ionicons name="play-skip-forward-outline" size={36} color={colors.warning} />
            <Text style={styles.reviewTitle}>Exercícios Pulados</Text>
            <Text style={styles.reviewSubtitle}>
              Você pulou {skippedIds.size} exercício{skippedIds.size > 1 ? 's' : ''} durante o treino.
              Deseja fazê-los agora?
            </Text>
            <View style={styles.reviewExercises}>
              {exercises
                .filter((e) => skippedIds.has(e.id))
                .map((e) => (
                  <Text key={e.id} style={styles.reviewExerciseItem}>• {e.exercise_name}</Text>
                ))}
            </View>
            <TouchableOpacity
              style={styles.reviewPrimaryBtn}
              onPress={() => setSkippedReviewVisible(false)}
            >
              <Text style={styles.reviewPrimaryBtnText}>Fazer Agora</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reviewSecondaryBtn}
              onPress={() => {
                setSkippedReviewVisible(false);
                handleFinish(skippedIds.size);
              }}
            >
              <Text style={styles.reviewSecondaryBtnText}>Concluir sem eles</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Feature 2: substitute exercise */}
      <Modal visible={substituteVisible} transparent animationType="slide">
        <Pressable style={styles.sheetOverlay} onPress={() => setSubstituteVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Substituir Exercício</Text>
              <Text style={styles.sheetSubtitle}>Apenas para esta sessão</Text>
              <TouchableOpacity onPress={() => setSubstituteVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={substituteOptions}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.substituteOption} onPress={() => handleSubstitute(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.substituteOptionName}>{item.name}</Text>
                    {item.muscle_group ? (
                      <Text style={styles.substituteOptionMuscle}>{item.muscle_group}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ gap: spacing.xs }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function SummaryChip({ icon, label, color = colors.textSecondary }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color?: string;
}) {
  return (
    <View style={summaryStyles.chip}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[summaryStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  label: { fontSize: font.sm, fontWeight: '600' },
});

function WeightModal({
  visible, kg, exerciseName, onChange, onSave, onSkip,
}: {
  visible: boolean; kg: string; exerciseName: string;
  onChange: (v: string) => void; onSave: () => void; onSkip: () => void;
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
          />
          <Text style={wStyles.unit}>kg</Text>
          <View style={wStyles.actions}>
            <TouchableOpacity style={wStyles.skipBtn} onPress={onSkip}>
              <Text style={wStyles.skipText}>Pular</Text>
            </TouchableOpacity>
            <TouchableOpacity style={wStyles.saveBtn} onPress={onSave}>
              <Text style={wStyles.saveText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ icon, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string }) {
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: font.md, textAlign: 'center' },
  input: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    padding: spacing.md, color: colors.text, fontSize: 32, fontWeight: '800',
    textAlign: 'center', width: 160,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm,
  },
  unit: { color: colors.textMuted, fontSize: font.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, width: '100%' },
  skipBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  skipText: { color: colors.textSecondary, fontSize: font.md },
  saveBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  headerLabel: { color: colors.primary, fontSize: font.sm, fontWeight: '700', letterSpacing: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  headerTitle: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginTop: 2 },
  overrideBadge: {
    backgroundColor: colors.primary + '22', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  overrideBadgeText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchBtn: {
    padding: spacing.xs, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  positionBadge: {
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  positionText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.full },
  progressLabel: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: -spacing.xs },
  skippedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.warning + '22', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  skippedBannerText: { color: colors.warning, fontSize: font.sm, fontWeight: '600' },
  warningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.warning + '22', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  warningText: { flex: 1, color: colors.warning, fontSize: font.sm, lineHeight: 18 },
  hintBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.primary + '22', borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  hintText: { flex: 1, color: colors.primary, fontSize: font.sm, lineHeight: 18 },
  restCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.xl, alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.warning + '44',
  },
  restTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  restTimer: { color: colors.warning, fontSize: 56, fontWeight: '800' },
  skipBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  skipBtnText: { color: colors.textSecondary, fontSize: font.sm },
  exerciseCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  exerciseImage: { width: '100%', height: 200 },
  exerciseImagePlaceholder: { width: '100%', height: 160, backgroundColor: colors.surfaceElevated, justifyContent: 'center', alignItems: 'center' },
  exerciseBody: { padding: spacing.md, gap: spacing.sm },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  exerciseName: { color: colors.text, fontSize: font.xl, fontWeight: '800', flex: 1 },
  dropBadge: {
    backgroundColor: colors.warning + '22', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  dropBadgeText: { color: colors.warning, fontSize: 10, fontWeight: '800' },
  muscleChipRow: { flexDirection: 'row' },
  muscleChip: {
    color: colors.primary, fontSize: 11, fontWeight: '600',
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full,
  },
  lastWeight: { color: colors.textSecondary, fontSize: font.sm, fontStyle: 'italic' },
  exerciseStats: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  dropWeights: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  dropWeightItem: { color: colors.textMuted, fontSize: font.sm },
  dropWeightActive: { color: colors.warning, fontWeight: '700' },
  setsContainer: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: spacing.sm },
  setsLabel: { color: colors.textSecondary, fontSize: font.md, fontWeight: '600' },
  setsDots: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: radius.full, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.success },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm },
  expandBtnText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  details: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  detailsLabel: { color: colors.primary, fontSize: font.sm, fontWeight: '700' },
  detailsText: { color: colors.textSecondary, fontSize: font.md, lineHeight: 22 },
  markBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.lg,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm,
    elevation: 4, shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  markBtnText: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
  secondaryActions: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: spacing.md, paddingVertical: spacing.xs,
  },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: spacing.sm },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnText: { color: colors.textSecondary, fontSize: font.sm },
  secondarySeparator: { width: 1, height: 14, backgroundColor: colors.border },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: colors.textSecondary, fontSize: font.md, textAlign: 'center', lineHeight: 24 },
  doneState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background },
  doneTitle: { color: colors.text, fontSize: font.xxl, fontWeight: '800' },
  doneSubtitle: { color: colors.textSecondary, fontSize: font.lg },
  doneSummaryRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  doneNext: {
    color: colors.primary, fontSize: font.md, fontWeight: '600',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full,
  },
  finishBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.lg, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  finishBtnText: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
  // Modals
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, maxHeight: '60%', gap: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.xs },
  sheetTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  sheetSubtitle: { color: colors.textMuted, fontSize: font.sm, marginTop: 2, flex: 1 },
  workoutOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  workoutOptionActive: { borderWidth: 1, borderColor: colors.primary },
  workoutOptionText: { color: colors.text, fontSize: font.md, flex: 1 },
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg },
  reviewModal: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.md, alignItems: 'center',
  },
  reviewTitle: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  reviewSubtitle: { color: colors.textSecondary, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  reviewExercises: { alignSelf: 'stretch', gap: spacing.xs },
  reviewExerciseItem: { color: colors.text, fontSize: font.md },
  reviewPrimaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, width: '100%', alignItems: 'center' },
  reviewPrimaryBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  reviewSecondaryBtn: { padding: spacing.sm, width: '100%', alignItems: 'center' },
  reviewSecondaryBtnText: { color: colors.textSecondary, fontSize: font.md },
  substituteOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceElevated, borderRadius: radius.md, padding: spacing.md,
  },
  substituteOptionName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  substituteOptionMuscle: { color: colors.primary, fontSize: font.sm, marginTop: 2 },
});
