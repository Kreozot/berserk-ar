import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';

import { CameraScreen } from './features/camera/CameraScreen';
import { CvRegressionScreen } from './testing/CvRegressionScreen';
import { isCvRegressionModeEnabled } from './testing/cvRegressionMode';

const CV_REGRESSION_MODE_ENABLED = isCvRegressionModeEnabled(
  __DEV__,
  Platform.OS,
  process.env.EXPO_PUBLIC_CV_REGRESSION,
);

/** Renders the application shell and the full-screen card-recognition camera experience. */
export function App() {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {CV_REGRESSION_MODE_ENABLED ? <CvRegressionScreen /> : <CameraScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
