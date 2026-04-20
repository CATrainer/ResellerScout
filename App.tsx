import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Reseller Scout — Day 1 placeholder screen.
 * Day 2 replaces this with the camera/upload screen → loading → price reveal core loop.
 * See personal/app-machine/design/reseller-scout.md for the spec.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reseller Scout</Text>
      <Text style={styles.tagline}>Scan to listed in 60s.</Text>
      <Text style={styles.note}>Day 1 scaffold — UK Vinted-first.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  tagline: {
    color: '#A7F3D0',
    fontSize: 18,
    marginBottom: 24,
  },
  note: {
    color: '#6B7280',
    fontSize: 12,
  },
});
