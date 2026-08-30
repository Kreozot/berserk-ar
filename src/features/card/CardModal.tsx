import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CardDefinition } from '../../catalog/cards';

type Props = {
  card: CardDefinition | null;
  onClose: () => void;
};

export function CardModal({ card, onClose }: Props) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={card !== null}
    >
      <View style={styles.container}>
        {card ? (
          <>
            <Image source={card.image} resizeMode="contain" style={styles.image} />
            <Text style={styles.title}>{card.nameRu}</Text>
          </>
        ) : null}

        <Pressable
          accessibilityLabel="Close card"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#090909',
    padding: 20,
  },
  image: {
    width: '100%',
    height: '82%',
  },
  title: {
    marginTop: 12,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  close: {
    position: 'absolute',
    right: 18,
    top: 42,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '300',
  },
});
