import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  createBodyRecord,
  deleteBodyRecord,
  getBodyRecords,
  getLatestBodyStats,
  getWeeklyVolumeByMuscleGroup,
} from '../../database';
import type { BodyRecord } from '../../types';
import LineChart, { type ChartPoint } from '../../components/LineChart';
import { colors, font, radius, spacing } from '../../theme';

const today = () => new Date().toISOString().split('T')[0];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function EvolutionScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const chartWidth = width - spacing.md * 2;

  const [records, setRecords] = useState<BodyRecord[]>([]);
  const [latestStats, setLatestStats] = useState<{
    latest_weight: number | null;
    latest_fat: number | null;
  }>({ latest_weight: null, latest_fat: null });
  const [volume, setVolume] = useState<Array<{ muscle_group: string; count: number }>>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [formDate, setFormDate] = useState(today());
  const [formWeight, setFormWeight] = useState('');
  const [formFat, setFormFat] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [recs, stats, vol] = await Promise.all([
      getBodyRecords(db),
      getLatestBodyStats(db),
      getWeeklyVolumeByMuscleGroup(db),
    ]);
    setRecords(recs);
    setLatestStats(stats);
    setVolume(vol);
  }, [db]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    load().then(() => {}).catch(() => {});
    return () => { cancelled = true; };
  }, [load]));

  const handleSave = async () => {
    const weight = formWeight.trim() ? parseFloat(formWeight.replace(',', '.')) : null;
    const fat = formFat.trim() ? parseFloat(formFat.replace(',', '.')) : null;

    if (weight === null && fat === null) {
      Alert.alert('Atenção', 'Preencha ao menos um valor (peso ou gordura).');
      return;
    }
    if ((weight !== null && isNaN(weight)) || (fat !== null && isNaN(fat))) {
      Alert.alert('Valor inválido', 'Use apenas números. Ex: 75.5');
      return;
    }

    setSaving(true);
    try {
      await createBodyRecord(db, { date: formDate, weight_kg: weight, body_fat_pct: fat });
      setModalVisible(false);
      setFormWeight('');
      setFormFat('');
      setFormDate(today());
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (rec: BodyRecord) => {
    Alert.alert('Excluir registro', `Excluir o registro de ${formatDate(rec.date)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => { await deleteBodyRecord(db, rec.id); load(); },
      },
    ]);
  };

  // Build chart data series
  const weightPoints: ChartPoint[] = records
    .filter((r) => r.weight_kg !== null)
    .map((r) => ({ date: r.date, value: r.weight_kg as number }));

  const fatPoints: ChartPoint[] = records
    .filter((r) => r.body_fat_pct !== null)
    .map((r) => ({ date: r.date, value: r.body_fat_pct as number }));

  const maxVolumeCount = volume.length > 0 ? volume[0].count : 1;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Latest stats cards ─────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatCard
            icon="scale-outline"
            label="Peso atual"
            value={latestStats.latest_weight !== null ? `${latestStats.latest_weight} kg` : '—'}
            color={colors.primary}
          />
          <StatCard
            icon="body-outline"
            label="Gordura atual"
            value={latestStats.latest_fat !== null ? `${latestStats.latest_fat}%` : '—'}
            color={colors.warning}
          />
        </View>

        {/* ── Weight chart ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <LineChart
            data={weightPoints}
            label="Peso Corporal"
            unit="kg"
            color={colors.primary}
            width={chartWidth - spacing.md * 2}
          />
        </View>

        {/* ── Body fat chart ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <LineChart
            data={fatPoints}
            label="Gordura Corporal"
            unit="%"
            color={colors.warning}
            width={chartWidth - spacing.md * 2}
          />
        </View>

        {/* ── Weekly volume ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Volume Semanal</Text>
          {volume.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum treino registrado nos últimos 7 dias</Text>
          ) : (
            <View style={styles.volumeList}>
              {volume.map((item) => (
                <View key={item.muscle_group} style={styles.volumeRow}>
                  <Text style={styles.volumeLabel}>{item.muscle_group}</Text>
                  <View style={styles.volumeBarTrack}>
                    <View
                      style={[
                        styles.volumeBar,
                        { width: `${(item.count / maxVolumeCount) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.volumeCount}>{item.count}x</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── History list ────────────────────────────────────────────── */}
        {records.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Histórico</Text>
            {[...records].reverse().map((rec) => (
              <TouchableOpacity
                key={rec.id}
                style={styles.recordRow}
                onLongPress={() => handleDelete(rec)}
                accessibilityLabel={`Registro de ${formatDate(rec.date)}. Pressione longamente para excluir.`}
              >
                <Text style={styles.recordDate}>{formatDate(rec.date)}</Text>
                <View style={styles.recordValues}>
                  {rec.weight_kg !== null && (
                    <Text style={styles.recordValue}>{rec.weight_kg} kg</Text>
                  )}
                  {rec.body_fat_pct !== null && (
                    <Text style={[styles.recordValue, { color: colors.warning }]}>
                      {rec.body_fat_pct}% gord.
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.hintText}>Pressione e segure para excluir um registro</Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        accessibilityLabel="Adicionar registro corporal"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Add record modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>Novo Registro</Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Data (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={formDate}
                  onChangeText={setFormDate}
                  placeholder="2025-01-28"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Peso (kg)</Text>
                  <TextInput
                    style={styles.input}
                    value={formWeight}
                    onChangeText={setFormWeight}
                    placeholder="75.5"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Gordura (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={formFat}
                    onChangeText={setFormFat}
                    placeholder="18.0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Salvar registro"
              >
                <Text style={styles.saveBtnText}>Salvar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[statStyles.card, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: 3,
  },
  label: { color: colors.textSecondary, fontSize: font.sm },
  value: { fontSize: font.xl, fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 80 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', paddingVertical: spacing.md },
  volumeList: { gap: spacing.sm },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  volumeLabel: { color: colors.textSecondary, fontSize: font.sm, width: 90 },
  volumeBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  volumeBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  volumeCount: { color: colors.textMuted, fontSize: font.sm, width: 26, textAlign: 'right' },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recordDate: { color: colors.textSecondary, fontSize: font.sm },
  recordValues: { flexDirection: 'row', gap: spacing.md },
  recordValue: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  hintText: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: spacing.xs },
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
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
