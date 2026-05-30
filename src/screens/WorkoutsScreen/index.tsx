import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, font, radius, spacing } from '../../theme';
import { createWorkout, deleteWorkout, getWorkoutExercises, getWorkouts } from '../../database';
import type { Workout } from '../../types';
import type { WorkoutListProps } from '../../navigation/types';

export default function WorkoutsScreen({ navigation }: WorkoutListProps) {
  const db = useSQLiteContext();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<number, number>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const ws = await getWorkouts(db);
    setWorkouts(ws);
    const counts: Record<number, number> = {};
    await Promise.all(
      ws.map(async (w) => {
        const exs = await getWorkoutExercises(db, w.id);
        counts[w.id] = exs.length;
      })
    );
    setExerciseCounts(counts);
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await createWorkout(db, newName.trim());
      setNewName('');
      setModalVisible(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (item: Workout) => {
    Alert.alert(
      'Excluir treino',
      `Deseja excluir "${item.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteWorkout(db, item.id);
            load();
          },
        },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: Workout; index: number }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('WorkoutDetail', {
          workoutId: item.id,
          workoutName: item.name,
        })
      }
      onLongPress={() => handleDelete(item)}
      activeOpacity={0.7}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{index + 1}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.count}>
          {exerciseCounts[item.id] ?? 0} exercício
          {(exerciseCounts[item.id] ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={workouts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={
          workouts.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="list-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum treino</Text>
            <Text style={styles.emptySubtitle}>
              Crie seus treinos A, B, C e a sequência circular começa automaticamente
            </Text>
          </View>
        }
      />

      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>Novo Treino</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="ex: Treino A — Peito e Tríceps"
              placeholderTextColor={colors.textMuted}
              autoFocus
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, creating && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.modalBtnPrimaryText}>Criar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.sm },
  emptyContainer: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: font.md },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  count: { color: colors.textSecondary, fontSize: font.sm, marginTop: 2 },
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
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  modalInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  modalBtnSecondary: { padding: spacing.md },
  modalBtnSecondaryText: { color: colors.textSecondary, fontSize: font.md },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  modalBtnPrimaryText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
