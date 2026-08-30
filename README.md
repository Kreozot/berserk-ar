# Berserk AR

Прототип мобильного приложения для распознавания физических карт ККИ «Берсерк» через камеру.

Идея: приложение видит расклад карт, определяет каждую карту, подсвечивает её поверх camera preview и по нажатию открывает заранее сохранённое изображение карты на весь экран.

## Первый прототип

Первый тестовый набор — **«Легенды Лаара»**, 19 карт.

Структура данных:

- `assets/cards/legends-of-laar/` — изображения 19 карт;
- `data/cards/legends-of-laar.json` — исходный каталог карт и источники;
- `src/catalog/cards.ts` — статические React Native asset bindings;
- `docs/development-plan.md` — этапы разработки;
- `docs/technical-options.md` — рассмотренные варианты технической реализации;
- `docs/adr/0001-card-recognition-architecture.md` — принятое архитектурное решение.

## Текущий стек MVP

- Expo SDK 57 / React Native 0.86;
- React Native VisionCamera;
- OpenCV для поиска границ карт и perspective correction (следующий этап);
- ORB для первой реализации `CardRecognizer` (следующий этап).

OpenCV и ORB являются сменными infrastructure adapters. UI и camera pipeline работают через нейтральные `CardDetector` / `CardRecognizer` contracts.

## Camera MVP

Сейчас реализован первый UI-проход:

1. приложение запрашивает разрешение камеры;
2. показывает live preview задней камеры через VisionCamera;
3. поверх камеры отображается **mock**-рамка карты `Огнегривый`;
4. нажатие на рамку открывает локальное изображение карты на весь экран;
5. закрытие изображения возвращает live camera preview.

Важно: текущая рамка пока не связана с содержимым кадра. Это намеренный mock для проверки camera → overlay → tap → fullscreen flow до подключения OpenCV.

## Локальный запуск Android

Требования:

- Node.js 22.13+;
- Android SDK / Android Studio;
- физическое Android-устройство или эмулятор с камерой.

```bash
npm install
npm run prebuild
npm run android
```

После первого native build дальнейшую JS/TS-разработку можно запускать через:

```bash
npm start
```

VisionCamera является native dependency, поэтому обычного Expo Go недостаточно — нужен development/native build.

## Архитектура CV

```text
Camera/UI
   |
   v
CardDetector
   |
   v
PerspectiveNormalizer
   |
   v
CardRecognizer
   |
   +-- OrbCardRecognizer        (MVP)
   +-- EmbeddingCardRecognizer  (возможная замена)
   +-- ML recognizer            (возможная замена)
```

Экран камеры не должен знать о feature descriptors, OpenCV matrices или ORB score.

## Источник тестовых изображений

Изображения и данные первого набора получены из базы ProBerserk:

- https://www.proberserk.ru/edition/e2ba8

ProBerserk указывает, что все права на ККИ «Берсерк» принадлежат компании «Мир Хобби». Эти изображения рассматриваются в репозитории как данные для разработки прототипа; права и условия распространения необходимо отдельно проверить до публичного релиза приложения.
