import type { ImageSourcePropType } from 'react-native';

import { findById } from './catalogLookup';

export type CardDefinition = {
  id: string;
  nameRu: string;
  image: ImageSourcePropType;
};

export const cards: CardDefinition[] = [
  {
    id: 'll-001',
    nameRu: 'Огнегривый',
    image: require('../../assets/cards/legends-of-laar/ll-001.jpg'),
  },
  {
    id: 'll-002',
    nameRu: 'Страж Тоа-Дана',
    image: require('../../assets/cards/legends-of-laar/ll-002.jpg'),
  },
  {
    id: 'll-003',
    nameRu: 'Лучник Дзара',
    image: require('../../assets/cards/legends-of-laar/ll-003.jpg'),
  },
  {
    id: 'll-004',
    nameRu: 'Орк-стрелок',
    image: require('../../assets/cards/legends-of-laar/ll-004.jpg'),
  },
  {
    id: 'll-005',
    nameRu: 'Орк-задира',
    image: require('../../assets/cards/legends-of-laar/ll-005.jpg'),
  },
  {
    id: 'll-006',
    nameRu: 'Гном-лучник',
    image: require('../../assets/cards/legends-of-laar/ll-006.jpg'),
  },
  {
    id: 'll-007',
    nameRu: 'Грозовой маг',
    image: require('../../assets/cards/legends-of-laar/ll-007.jpg'),
  },
  {
    id: 'll-008',
    nameRu: 'Железный голем',
    image: require('../../assets/cards/legends-of-laar/ll-008.jpg'),
  },
  {
    id: 'll-009',
    nameRu: 'Дитя вьюги',
    image: require('../../assets/cards/legends-of-laar/ll-009.jpg'),
  },
  { id: 'll-010', nameRu: 'Цвар', image: require('../../assets/cards/legends-of-laar/ll-010.jpg') },
  {
    id: 'll-011',
    nameRu: 'Торговка эликсирами',
    image: require('../../assets/cards/legends-of-laar/ll-011.jpg'),
  },
  {
    id: 'll-012',
    nameRu: 'Эльфийский следопыт',
    image: require('../../assets/cards/legends-of-laar/ll-012.jpg'),
  },
  {
    id: 'll-013',
    nameRu: 'Боров Лихолесья',
    image: require('../../assets/cards/legends-of-laar/ll-013.jpg'),
  },
  {
    id: 'll-014',
    nameRu: 'Ольгерд',
    image: require('../../assets/cards/legends-of-laar/ll-014.jpg'),
  },
  {
    id: 'll-015',
    nameRu: 'Большой кулак',
    image: require('../../assets/cards/legends-of-laar/ll-015.jpg'),
  },
  {
    id: 'll-016',
    nameRu: 'Карга',
    image: require('../../assets/cards/legends-of-laar/ll-016.jpg'),
  },
  {
    id: 'll-017',
    nameRu: 'Раб клинка',
    image: require('../../assets/cards/legends-of-laar/ll-017.jpg'),
  },
  {
    id: 'll-018',
    nameRu: 'Тролль-воин',
    image: require('../../assets/cards/legends-of-laar/ll-018.jpg'),
  },
  {
    id: 'll-019',
    nameRu: 'Летописец',
    image: require('../../assets/cards/legends-of-laar/ll-019.jpg'),
  },
];

/** Returns the bundled card definition for a stable card id, if it exists. */
export const getCardById = (cardId: string): CardDefinition | undefined => findById(cards, cardId);
