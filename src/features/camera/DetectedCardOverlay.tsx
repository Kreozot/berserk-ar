import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import type { Point, Quadrilateral } from '../../core/vision/types';
import type { OrbRecognitionDiagnostics } from '../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrb';

type Props = {
  card: CardDefinition | null;
  confidence: number;
  corners: Quadrilateral;
  diagnostics: OrbRecognitionDiagnostics;
  onPress: (card: CardDefinition) => void;
};

function getLineStyle(start: Point, end: Point): ViewStyle {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;

  return {
    position: 'absolute',
    left: centerX - length / 2,
    top: centerY - 1.5,
    width: length,
    height: 3,
    transform: [{ rotate: `${angle}rad` }],
  };
}

export function DetectedCardOverlay({
  card,
  confidence,
  corners,
  diagnostics,
  onPress,
}: Props) {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  const confidencePercent = Math.round(confidence * 100);
  const bestCandidate = diagnostics.bestCardId
    ? (getCardById(diagnostics.bestCardId)?.nameRu ?? diagnostics.bestCardId)
    : 'none';
  const title = card
    ? `${card.nameRu} · ${confidencePercent}%`
    : `UNKNOWN · best: ${bestCandidate}`;
  const metrics = [
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
        return <View key={index} pointerEvents="none" style={[styles.edge, getLineStyle(corner, next)]} />;
      })}

      <Pressable
        accessibilityRole={card ? 'button' : undefined}
        accessibilityLabel={card ? `Open ${card.nameRu}` : 'Unrecognized card'}
        disabled={card === null}
        onPress={() => {
          if (card) {
            onPress(card);
          }
        }}
        style={[
          styles.hitArea,
          {
            left,
            top,
            width: Math.max(44, right - left),
            height: Math.max(44, bottom - top),
          },
        ]}
      >
        <View style={styles.label}>
          <Text style={styles.labelTitle}>{title}</Text>
          <Text style={styles.labelMetrics}>{metrics}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  hitArea: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  label: {
    position: 'absolute',
    left: 0,
    bottom: -46,
    maxWidth: 330,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  labelTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  labelMetrics: {
    marginTop: 2,
    color: '#cccccc',
    fontSize: 9,
    fontWeight: '500',
  },
});
