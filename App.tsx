import React, { Suspense } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AppNavigator from "./src/navigation/AppNavigator";
import { initDb } from "./src/database";
import { colors } from "./src/theme";

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

function Loader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SQLiteProvider
        databaseName="personal_gym.db"
        assetSource={{ assetId: require("./assets/personal_gym.db") }}
        onInit={initDb}
        useSuspense
      >
        <Suspense fallback={<Loader />}>
          <NavigationContainer theme={navTheme}>
            <AppNavigator />
          </NavigationContainer>
        </Suspense>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
