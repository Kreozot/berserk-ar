import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';

import { CameraScreen } from './features/camera/CameraScreen';

/** Renders the application shell and the full-screen card-recognition camera experience. */
export function App() {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <CameraScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
