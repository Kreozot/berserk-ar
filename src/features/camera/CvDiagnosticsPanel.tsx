import { StyleSheet, Text, View } from 'react-native';

import type { FrameDiagnostics } from '../../core/vision/frameDiagnostics';
import { formatCvDiagnostics } from './cvDiagnostics';

type Props = {
  readonly diagnostics: FrameDiagnostics | null;
};

/** Renders opt-in live timings and stage counts without owning camera state. */
export function CvDiagnosticsPanel({ diagnostics }: Props) {
  const lines = diagnostics === null ? null : formatCvDiagnostics(diagnostics);
  const sceneReset = diagnostics?.sceneReset ?? false;

  return (
    <View pointerEvents="none" style={styles.panel}>
      <Text style={styles.title}>CV DIAGNOSTICS</Text>
      {lines === null ? (
        <Text style={styles.value}>WAITING FOR FRAME…</Text>
      ) : (
        <>
          <Text style={styles.value}>{lines.timing}</Text>
          <Text style={styles.value}>{lines.pipeline}</Text>
          <Text style={[styles.scene, sceneReset && styles.sceneReset]}>{lines.scene}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 44,
    left: 12,
    right: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(89,214,255,0.5)',
    backgroundColor: 'rgba(0,12,18,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  title: { color: '#59d6ff', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  value: { marginTop: 3, color: '#ffffff', fontSize: 10, fontWeight: '600' },
  scene: { marginTop: 3, color: '#86e89f', fontSize: 9, fontWeight: '800' },
  sceneReset: { color: '#ffce59' },
});
