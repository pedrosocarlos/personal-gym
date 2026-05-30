import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import type {
  EvolutionStackParamList,
  ExercisesStackParamList,
  WorkoutsStackParamList,
} from './types';

import ExercisesScreen from '../screens/ExercisesScreen';
import ExerciseFormScreen from '../screens/ExercisesScreen/ExerciseForm';
import WorkoutsScreen from '../screens/WorkoutsScreen';
import WorkoutDetailScreen from '../screens/WorkoutsScreen/WorkoutDetail';
import TodayScreen from '../screens/TodayScreen';
import EvolutionScreen from '../screens/EvolutionScreen';

const Tab = createBottomTabNavigator();
const ExercisesStack = createNativeStackNavigator<ExercisesStackParamList>();
const WorkoutsStack = createNativeStackNavigator<WorkoutsStackParamList>();
const EvolutionStack = createNativeStackNavigator<EvolutionStackParamList>();

const stackOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.background },
};

function ExercisesNavigator() {
  return (
    <ExercisesStack.Navigator screenOptions={stackOptions}>
      <ExercisesStack.Screen
        name="ExerciseList"
        component={ExercisesScreen}
        options={{ title: 'Exercícios' }}
      />
      <ExercisesStack.Screen name="ExerciseForm" component={ExerciseFormScreen} />
    </ExercisesStack.Navigator>
  );
}

function WorkoutsNavigator() {
  return (
    <WorkoutsStack.Navigator screenOptions={stackOptions}>
      <WorkoutsStack.Screen
        name="WorkoutList"
        component={WorkoutsScreen}
        options={{ title: 'Treinos' }}
      />
      <WorkoutsStack.Screen
        name="WorkoutDetail"
        component={WorkoutDetailScreen}
        options={({ route }) => ({ title: route.params.workoutName })}
      />
    </WorkoutsStack.Navigator>
  );
}

function EvolutionNavigator() {
  return (
    <EvolutionStack.Navigator screenOptions={stackOptions}>
      <EvolutionStack.Screen
        name="EvolutionMain"
        component={EvolutionScreen}
        options={{ title: 'Evolução Corporal' }}
      />
    </EvolutionStack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: 4,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
          let iconName: IoniconName;
          if (route.name === 'ExercisesTab') {
            iconName = focused ? 'barbell' : 'barbell-outline';
          } else if (route.name === 'WorkoutsTab') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'TodayTab') {
            iconName = focused ? 'today' : 'today-outline';
          } else {
            iconName = focused ? 'analytics' : 'analytics-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="ExercisesTab" component={ExercisesNavigator} options={{ title: 'Exercícios' }} />
      <Tab.Screen name="WorkoutsTab" component={WorkoutsNavigator} options={{ title: 'Treinos' }} />
      <Tab.Screen
        name="TodayTab"
        component={TodayScreen}
        options={{
          title: 'Hoje',
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
      <Tab.Screen name="EvolutionTab" component={EvolutionNavigator} options={{ title: 'Evolução' }} />
    </Tab.Navigator>
  );
}
