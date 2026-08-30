import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CardDefinition } from '../../catalog/cards';

export type OverlayRect = {
  left: `${number}%`;
  top: `${number}%`;
  width: `${number}%`;
};

type Props = {
  card: CardDefinition;
  rect: OverlayRect;
  onPress: (card: CardDefinition) => void;
};

export function DetectedCardOverlay({ card, rect, onPress }: Props) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${card.nameRu}`}
        onPress={() => onPress(card)}
        style={[
          styles.card,
          {
            left: rect.left,
            top: rect.top,
            width: rect.width,
          },
        ]}
      >
        <Text style={styles.label}>{card.nameRu}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    aspectRatio: 63 / 89,
    borderWidth: 3,
    borderColor: '#ffffff',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  label: {
    position: 'absolute',
    left: -3,
    bottom: -30,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
});
