import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, font, radius, spacing } from '../../theme';
import {
  addExerciseToWorkout,
  getExercises,
  getWorkoutExercises,
  removeExerciseFromWorkout,
  reorderWorkoutExercises,
  updateWorkoutExercise,
} from '../../database';
import { SMALL_MUSCLES, SYNERGIST_CONFLICTS } from '../../types';
import type { Exercise, WorkoutExerciseWithDetails } from '../../types';
import type { WorkoutDetailProps } from '../../navigation/types';

// ─── Smart ordering algorithm (physiologist-reviewed) ────────────────────────
// Scoring: same group +10, consecutive small +5, synergist conflict +8.
// Picks the lowest-conflict candidate at each step.
function computeSmartOrder(
  exercises: WorkoutExerciseWithDetails[]
): WorkoutExerciseWithDetails[] {
  if (exercises.length <= 1) return [...exercises];

  const isSmall = (e: WorkoutExerciseWithDetails) =>
    SMALL_MUSCLES.has(e.exercise_muscle_group ?? '');

  const result: WorkoutExerciseWithDetails[] = [];
  const remaining = [...exercises];

  while (remaining.length > 0) {
    const lastEx = result[result.length - 1];

    if (!lastEx) {
      // First pick: prefer a large/compound muscle
      const largeIdx = remaining.findIndex((e) => !isSmall(e));
      result.push(remaining.splice(largeIdx !== -1 ? largeIdx : 0, 1)[0]);
      continue;
    }

    const lastMuscle = lastEx.exercise_muscle_group ?? '';
    const synTargets = (SYNERGIST_CONFLICTS as Record<string, string[]>)[lastMuscle] ?? [];

    const scored = remaining.map((e, idx) => {
      const m = e.exercise_muscle_group ?? '';
      let score = 0;
      if (m === lastMuscle && m !== '') score += 10;
      if (isSmall(lastEx) && isSmall(e)) score += 5;
      if (synTargets.includes(m)) score += 8;
      return { idx, score };
    });

    scored.sort((a, b) => a.score - b.score);
    result.push(remaining.splice(scored[0].idx, 1)[0]);
  }

  return result;
}

type AddModal = { visible: boolean; exercise: Exercise | null; sets: string; reps: string; rest: string };
type EditModal = { visible: boolean; item: WorkoutExerciseWithDetails | null; sets: string; reps: string; rest: string };

export default function WorkoutDetailScreen({ route, navigation }: WorkoutDetailProps) {
  const db = useSQLiteContext();
  const { workoutId } = route.params;

  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseWithDetails[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [selectModalVisible, setSelectModalVisible] = useState(false);
  const [addModal, setAddModal] = useState<AddModal>({
    visible: false, exercise: null, sets: '3', reps: '10', rest: '60',
  });
  const [editModal, setEditModal] = useState<EditModal>({
    visible: false, item: null, sets: '3', reps: '10', rest: '60',
  });

  const load = useCallback(async () => {
    const [we, ex] = await Promise.all([
      getWorkoutExercises(db, workoutId),
      getExercises(db),
    ]);
    setWorkoutExercises(we);
    setAllExercises(ex);
  }, [db, workoutId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Smart ordering — reorder and persist new positions
  const handleSmartOrder = () => {
    if (workoutExercises.length < 2) {
      Alert.alert('Sem conflitos', 'Adicione ao menos 2 exercícios para usar a ordenação inteligente.');
      return;
    }
    const reordered = computeSmartOrder(workoutExercises);
    const changed = reordered.some((e, i) => e.id !== workoutExercises[i].id);
    if (!changed) {
      Alert.alert('Já otimizado', 'A sequência atual já evita conflitos musculares consecutivos.');
      return;
    }
    Alert.alert(
      'Ordenação Inteligente',
      'Reorganizar os exercícios para minimizar a pré-fadiga de músculos sinergistas e consecutivos?\n\nBaseado nas diretrizes NSCA/ACSM.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reorganizar',
          onPress: async () => {
            try {
              await reorderWorkoutExercises(db, reordered.map((e) => e.id));
              load();
            } catch {
              Alert.alert('Erro', 'Não foi possível reorganizar. Tente novamente.');
            }
          },
        },
      ]
    );
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSmartOrder}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}
          accessibilityLabel="Ordenação inteligente"
          accessibilityRole="button"
        >
          <Ionicons name="shuffle-outline" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: font.sm, fontWeight: '600' }}>
            Ordenar
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [workoutExercises]);

  const openAddModal = (exercise: Exercise) => {
    setSelectModalVisible(false);
    setAddModal({ visible: true, exercise, sets: '3', reps: '10', rest: '60' });
  };

  const handleAdd = async () => {
    if (!addModal.exercise) return;
    try {
      await addExerciseToWorkout(
        db,
        workoutId,
        addModal.exercise.id,
        parseInt(addModal.sets, 10) || 3,
        parseInt(addModal.reps, 10) || 10,
        parseInt(addModal.rest, 10) || 60
      );
      setAddModal({ visible: false, exercise: null, sets: '3', reps: '10', rest: '60' });
      load();
    } catch {
      Alert.alert('Erro', 'Não foi possível adicionar o exercício. Tente novamente.');
    }
  };

  const openEditModal = (item: WorkoutExerciseWithDetails) => {
    setEditModal({
      visible: true,
      item,
      sets: item.sets.toString(),
      reps: item.reps.toString(),
      rest: item.rest_seconds.toString(),
    });
  };

  const handleEdit = async () => {
    if (!editModal.item) return;
    try {
      await updateWorkoutExercise(
        db,
        editModal.item.id,
        parseInt(editModal.sets, 10) || 3,
        parseInt(editModal.reps, 10) || 10,
        parseInt(editModal.rest, 10) || 60
      );
      setEditModal({ visible: false, item: null, sets: '3', reps: '10', rest: '60' });
      load();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar as alterações. Tente novamente.');
    }
  };

  const handleRemove = (item: WorkoutExerciseWithDetails) => {
    Alert.alert(
      'Remover exercício',
      `Remover "${item.exercise_name}" deste treino?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await removeExerciseFromWorkout(db, item.id);
            load();
          },
        },
      ]
    );
  };

  const renderWorkoutExercise = ({
    item,
    index,
  }: {
    item: WorkoutExerciseWithDetails;
    index: number;
  }) => (
    <View style={styles.exerciseCard}>
      <View style={styles.exercisePos}>
        <Text style={styles.exercisePosText}>{index + 1}</Text>
      </View>
      <View style={styles.exerciseThumbnail}>
        {item.exercise_image ? (
          <Image
            source={{ uri: item.exercise_image }}
            style={styles.exerciseImage}
            accessibilityLabel={item.exercise_name}
          />
        ) : (
          <Ionicons name="barbell-outline" size={22} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{item.exercise_name}</Text>
        <View style={styles.exerciseMeta}>
          {item.exercise_muscle_group ? (
            <Text style={styles.muscleChip}>{item.exercise_muscle_group}</Text>
          ) : null}
          <Text style={styles.exerciseDetail}>
            {item.sets}×{item.reps} · {item.rest_seconds}s
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => openEditModal(item)}
        style={styles.actionBtn}
        accessibilityLabel={`Editar ${item.exercise_name}`}
        accessibilityRole="button"
      >
        <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleRemove(item)}
        style={styles.actionBtn}
        accessibilityLabel={`Remover ${item.exercise_name}`}
        accessibilityRole="button"
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  const renderExerciseOption = ({ item }: { item: Exercise }) => (
    <TouchableOpacity style={styles.exerciseOption} onPress={() => openAddModal(item)}>
      <View style={styles.optionThumb}>
        {item.image_path ? (
          <Image source={{ uri: item.image_path }} style={styles.optionImage} />
        ) : (
          <Ionicons name="barbell-outline" size={20} color={colors.textMuted} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionName}>{item.name}</Text>
        {item.muscle_group ? (
          <Text style={styles.optionMuscle}>{item.muscle_group}</Text>
        ) : null}
      </View>
      <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={workoutExercises}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderWorkoutExercise}
        contentContainerStyle={
          workoutExercises.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="add-circle-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Treino vazio</Text>
            <Text style={styles.emptySubtitle}>
              Adicione exercícios para montar sua sequência
            </Text>
          </View>
        }
      />

      <Pressable
        style={styles.fab}
        onPress={() => setSelectModalVisible(true)}
        accessibilityLabel="Adicionar exercício ao treino"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Select Exercise */}
      <Modal visible={selectModalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Selecionar Exercício</Text>
              <TouchableOpacity
                onPress={() => setSelectModalVisible(false)}
                accessibilityLabel="Fechar"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {allExercises.length === 0 ? (
              <Text style={styles.emptySubtitle}>
                Cadastre exercícios na aba Exercícios primeiro.
              </Text>
            ) : (
              <FlatList
                data={allExercises}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderExerciseOption}
                contentContainerStyle={{ gap: spacing.xs }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Add params */}
      <Modal visible={addModal.visible} transparent animationType="fade">
        <Pressable
          style={styles.centeredOverlay}
          onPress={() => setAddModal((m) => ({ ...m, visible: false }))}
        >
          <Pressable style={styles.paramsModal} onPress={() => {}}>
            <Text style={styles.paramsTitle}>{addModal.exercise?.name}</Text>
            {addModal.exercise?.muscle_group ? (
              <Text style={styles.paramsMuscle}>{addModal.exercise.muscle_group}</Text>
            ) : null}
            <ParamRow label="Séries" value={addModal.sets} onChange={(v) => setAddModal((m) => ({ ...m, sets: v }))} />
            <ParamRow label="Repetições" value={addModal.reps} onChange={(v) => setAddModal((m) => ({ ...m, reps: v }))} />
            <ParamRow label="Descanso (s)" value={addModal.rest} onChange={(v) => setAddModal((m) => ({ ...m, rest: v }))} />
            <TouchableOpacity style={styles.confirmBtn} onPress={handleAdd}>
              <Text style={styles.confirmBtnText}>Adicionar ao Treino</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit params */}
      <Modal visible={editModal.visible} transparent animationType="fade">
        <Pressable
          style={styles.centeredOverlay}
          onPress={() => setEditModal((m) => ({ ...m, visible: false }))}
        >
          <Pressable style={styles.paramsModal} onPress={() => {}}>
            <Text style={styles.paramsTitle}>{editModal.item?.exercise_name}</Text>
            {editModal.item?.exercise_muscle_group ? (
              <Text style={styles.paramsMuscle}>{editModal.item.exercise_muscle_group}</Text>
            ) : null}
            <ParamRow label="Séries" value={editModal.sets} onChange={(v) => setEditModal((m) => ({ ...m, sets: v }))} />
            <ParamRow label="Repetições" value={editModal.reps} onChange={(v) => setEditModal((m) => ({ ...m, reps: v }))} />
            <ParamRow label="Descanso (s)" value={editModal.rest} onChange={(v) => setEditModal((m) => ({ ...m, rest: v }))} />
            <TouchableOpacity style={styles.confirmBtn} onPress={handleEdit}>
              <Text style={styles.confirmBtnText}>Salvar Alterações</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ParamRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={paramStyles.row}>
      <Text style={paramStyles.label}>{label}</Text>
      <TextInput
        style={paramStyles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
        accessibilityLabel={label}
      />
    </View>
  );
}

const paramStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.textSecondary, fontSize: font.md },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    fontSize: font.md,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 70,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  emptyContainer: { flex: 1 },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  exercisePos: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exercisePosText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  exerciseThumbnail: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  exerciseImage: { width: 44, height: 44 },
  exerciseInfo: { flex: 1 },
  exerciseName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  exerciseMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  muscleChip: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  exerciseDetail: { color: colors.textSecondary, fontSize: font.sm },
  actionBtn: { padding: spacing.sm },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: font.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '75%',
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  exerciseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  optionThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  optionImage: { width: 40, height: 40 },
  optionName: { color: colors.text, fontSize: font.md, fontWeight: '500' },
  optionMuscle: { color: colors.primary, fontSize: font.sm, marginTop: 2 },
  paramsModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  paramsTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  paramsMuscle: { color: colors.primary, fontSize: font.sm, fontWeight: '600', marginTop: -spacing.sm },
  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  confirmBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
