import React, { useLayoutEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
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
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, spacing } from '../../theme';
import { createExercise, updateExercise } from '../../database';
import { MUSCLE_GROUPS } from '../../types';
import type { ExerciseFormProps } from '../../navigation/types';

export default function ExerciseFormScreen({ route, navigation }: ExerciseFormProps) {
  const db = useSQLiteContext();
  const exercise = route.params?.exercise;
  const isEditing = !!exercise;

  const [name, setName] = useState(exercise?.name ?? '');
  const [description, setDescription] = useState(exercise?.description ?? '');
  const [tips, setTips] = useState(exercise?.tips ?? '');
  const [imagePath, setImagePath] = useState<string | null>(exercise?.image_path ?? null);
  const [muscleGroup, setMuscleGroup] = useState<string>(
    exercise?.muscle_group ?? 'Full Body'
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'O nome do exercício é obrigatório.');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        tips: tips.trim(),
        image_path: imagePath,
        muscle_group: muscleGroup,
      };
      if (isEditing) {
        await updateExercise(db, exercise.id, data);
      } else {
        await createExercise(db, data);
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Editar Exercício' : 'Novo Exercício',
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          accessibilityLabel="Salvar exercício"
          accessibilityRole="button"
        >
          <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>Salvar</Text>
        </TouchableOpacity>
      ),
    });
  }, [name, description, tips, imagePath, muscleGroup, saving]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria de fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      setImagePath(result.assets[0].uri);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Image picker */}
        <Pressable
          style={styles.imagePicker}
          onPress={pickImage}
          accessibilityLabel="Selecionar foto do exercício"
          accessibilityRole="button"
        >
          {imagePath ? (
            <Image
              source={{ uri: imagePath }}
              style={styles.imagePreview}
              accessibilityLabel="Foto selecionada"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={40} color={colors.textMuted} />
              <Text style={styles.imagePlaceholderText}>Toque para adicionar foto</Text>
            </View>
          )}
          <View style={styles.imageOverlay}>
            <Ionicons name="camera" size={20} color="#fff" />
          </View>
        </Pressable>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Nome *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="ex: Supino Reto"
            placeholderTextColor={colors.textMuted}
            returnKeyType="next"
          />
        </View>

        {/* Muscle group picker */}
        <View style={styles.field}>
          <Text style={styles.label}>Grupo Muscular</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setPickerVisible(true)}
            accessibilityLabel={`Grupo muscular: ${muscleGroup}. Toque para alterar`}
            accessibilityRole="button"
          >
            <Text style={styles.pickerBtnText}>{muscleGroup}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Descrição</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Como executar o movimento..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Tips */}
        <View style={styles.field}>
          <Text style={styles.label}>Dicas</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={tips}
            onChangeText={setTips}
            placeholder="Pontos de atenção e erros comuns..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      {/* Muscle group selection modal */}
      <Modal visible={pickerVisible} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Grupo Muscular</Text>
            <FlatList
              data={MUSCLE_GROUPS as unknown as string[]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.muscleOption,
                    item === muscleGroup && styles.muscleOptionSelected,
                  ]}
                  onPress={() => {
                    setMuscleGroup(item);
                    setPickerVisible(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: item === muscleGroup }}
                >
                  <Text
                    style={[
                      styles.muscleOptionText,
                      item === muscleGroup && styles.muscleOptionTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                  {item === muscleGroup && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ gap: 2 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  saveBtn: { color: colors.primary, fontSize: font.md, fontWeight: '700', paddingRight: 4 },
  imagePicker: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    position: 'relative',
  },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  imagePlaceholderText: { color: colors.textMuted, fontSize: font.sm },
  imageOverlay: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    padding: spacing.sm,
  },
  field: { gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multiline: { minHeight: 100 },
  pickerBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerBtnText: { color: colors.text, fontSize: font.md },
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
    maxHeight: '70%',
    gap: spacing.md,
  },
  sheetTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  muscleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  muscleOptionSelected: { backgroundColor: colors.surfaceElevated },
  muscleOptionText: { color: colors.textSecondary, fontSize: font.md },
  muscleOptionTextSelected: { color: colors.text, fontWeight: '600' },
});
