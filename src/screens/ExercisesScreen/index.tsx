import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors, font, radius, spacing } from '../../theme';
import { deleteExercise, getExercises } from '../../database';
import type { Exercise } from '../../types';
import type { ExerciseListProps } from '../../navigation/types';

export default function ExercisesScreen({ navigation }: ExerciseListProps) {
  const db = useSQLiteContext();
  const [exercises, setExercises] = useState<Exercise[]>([]);

  const load = useCallback(async () => {
    setExercises(await getExercises(db));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleExport = useCallback(async () => {
    try {
      const dbPath = `${FileSystem.documentDirectory}SQLite/personal_gym.db`;
      const dest = `${FileSystem.cacheDirectory}personal_gym_backup.db`;
      await FileSystem.copyAsync({ from: dbPath, to: dest });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Indisponível', 'Compartilhamento não suportado neste dispositivo.');
        return;
      }
      await Sharing.shareAsync(dest, {
        mimeType: 'application/x-sqlite3',
        dialogTitle: 'Exportar banco de dados',
        UTI: 'public.database',
      });
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    }
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleExport} style={{ marginRight: 4 }}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleExport]);

  const handleDelete = (item: Exercise) => {
    Alert.alert(
      'Excluir exercício',
      `Deseja excluir "${item.name}"? Ele será removido de todos os treinos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteExercise(db, item.id);
            load();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Exercise }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ExerciseForm', { exercise: item })}
      onLongPress={() => handleDelete(item)}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnail}>
        {item.image_path ? (
          <Image source={{ uri: item.image_path }} style={styles.image} />
        ) : (
          <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        {item.muscle_group ? (
          <View style={styles.chipRow}>
            <Text style={styles.chip}>{item.muscle_group}</Text>
          </View>
        ) : null}
        {item.description ? (
          <Text style={styles.desc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={
          exercises.length === 0 ? styles.emptyContainer : styles.list
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="barbell-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum exercício</Text>
            <Text style={styles.emptySubtitle}>
              Toque em + para cadastrar seu primeiro exercício
            </Text>
          </View>
        }
      />
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('ExerciseForm', {})}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
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
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: { width: 56, height: 56 },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  chipRow: { flexDirection: 'row', marginTop: 3 },
  chip: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.primary + '22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  desc: { color: colors.textSecondary, fontSize: font.sm, marginTop: 3 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: font.md,
    textAlign: 'center',
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
});
