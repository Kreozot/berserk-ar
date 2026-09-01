import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import type { Quadrilateral } from '../../core/vision/types';
import type { OrbRecognitionDiagnostics } from '../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrb';
import { getOverlayLineGeometry } from './overlayGeometry';

type Props = {
  card: CardDefinition | null;
  confidence: number;
  corners: Quadrilateral;
  diagnostics: OrbRecognitionDiagnostics;
  onPress: (card: CardDefinition) => void;
  retainedIdentity: boolean;
  trackId: string;
};

const RECOGNIZED_COLOR = '#35d06f';
const UNKNOWN_COLOR = '#f0b429';

/**
 * Draws an interactive quadrilateral around one detected card plus recognition diagnostics.
 * Recognized cards are tappable and open their high-resolution card image.
 */
export function DetectedCardOverlay({
  card,
  confidence,
  corners,
  diagnostics,
  onPress,
  retainedIdentity,
  trackId,
}: Props) {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  const confidencePercent = Math.round(confidence * 100);
  const isRecognized = card !== null;
  const accentColor = isRecognized ? RECOGNIZED_COLOR : UNKNOWN_COLOR;
  const bestCandidate = diagnostics.bestCardId
    ? (getCardById(diagnostics.bestCardId)?.nameRu ?? diagnostics.bestCardId)
    : 'none';
  const sourceSuffix = retainedIdentity ? ' · TRACK' : '';
  const title = card
    ? `${card.nameRu} · ${confidencePercent}%${sourceSuffix}`
    : `UNKNOWN · best: ${bestCandidate}`;
  const metrics = [
    trackId,
    `q=${diagnostics.queryDescriptors}`,
    `m=${diagnostics.bestGoodMatches}/${diagnostics.secondBestGoodMatches}`,
    `gm=${diagnostics.goodMatchRatio.toFixed(2)}`,
    `Δ=${diagnostics.winnerMargin}`,
    `wr=${diagnostics.winnerRatio.toFixed(2)}`,
  ].join('  ');

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {corners.map((corner, index) => {
        const next = corners[(index + 1) % corners.length];
        const line = getOverlayLineGeometry(corner, next);
        return (
          <View
            key={index}
            pointerEvents="none"
            style={[
              styles.edge,
              {
                position: 'absolute',
                left: line.left,
                top: line.top,
                width: line.width,
                height: line.height,
                transform: [{ rotate: `${line.angleRad}rad` }],
                backgroundColor: accentColor,
              },
            ]}
          />
        );
      })}

      <Pressable
        accessibilityRole={card ? 'button' : undefined}
        accessibilityLabel={card ? `Open ${card.nameRu}` : 'Unrecognized rectangle'}
        disabled={card === null}
        onPress={() => {
          if (card) onPress(card);
        }}
        style={[
          styles.hitArea,
          {
            left,
            top,
            width: Math.max(44, right - left),
            height: Math.max(44, bottom - top),
            backgroundColor: isRecognized
              ? 'rgba(53,208,111,0.04)'
              : 'rgba(240,180,41,0.035)',
          },
        ]}
      >
        <View style={[styles.label, { borderColor: accentColor }]}>
          <Text style={[styles.labelTitle, { color: accentColor }]}>{title}</Text>
          <Text style={styles.labelMetrics}>{metrics}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { borderRadius: 2 },
  hitArea: { position: 'absolute' },
  label: {
    position: 'absolute',
    left: 0,
    bottom: -46,
    maxWidth: 330,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  labelTitle: { fontSize: 12, fontWeight: '700' },
  labelMetrics: { marginTop: 2, color: '#cccccc', fontSize: 9, fontWeight: '500' },
});
