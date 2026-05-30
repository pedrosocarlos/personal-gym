import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Exercise } from '../types';

export type ExercisesStackParamList = {
  ExerciseList: undefined;
  ExerciseForm: { exercise?: Exercise };
};

export type WorkoutsStackParamList = {
  WorkoutList: undefined;
  WorkoutDetail: { workoutId: number; workoutName: string };
};

export type EvolutionStackParamList = {
  EvolutionMain: undefined;
};

export type ExerciseListProps = NativeStackScreenProps<ExercisesStackParamList, 'ExerciseList'>;
export type ExerciseFormProps = NativeStackScreenProps<ExercisesStackParamList, 'ExerciseForm'>;
export type WorkoutListProps = NativeStackScreenProps<WorkoutsStackParamList, 'WorkoutList'>;
export type WorkoutDetailProps = NativeStackScreenProps<WorkoutsStackParamList, 'WorkoutDetail'>;
