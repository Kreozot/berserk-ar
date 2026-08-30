import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { CardDefinition } from '../../catalog/cards';
import type { Point, Quadrilateral } from '../../core/vision/types';

type Props = {
  card: CardDefinition;
  corners: Quadrilateral;
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

export function DetectedCardOverlay({ card, corners, onPress }: Props) {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {corners.map((corner, index) => {
        const next = corners[(index + 1) % corners.length];
        return <View key={index} pointerEvents="none" style={[styles.edge, getLineStyle(corner, next)]} />;
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${card.nameRu}`}
        onPress={() => onPress(card)}
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
        <Text style={styles.label}>{card.nameRu} · mock ID</Text>
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
    bottom: -28,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
});
