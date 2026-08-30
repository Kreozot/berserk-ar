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
- React Native VisionCamera 5;
- `react-native-fast-opencv` для CV-операций;
- VisionCamera Resizer для уменьшения кадров перед OpenCV;
- ORB для первой реализации `CardRecognizer` (следующий этап).

OpenCV и ORB являются сменными infrastructure adapters. OpenCV-типы не должны попадать в UI/core.

## Текущий Camera/CV flow

На текущем этапе реализовано:

1. приложение запрашивает разрешение камеры;
2. показывает live preview задней камеры через VisionCamera;
3. отдельный Frame Output получает уменьшенные кадры;
4. тяжёлая CV-обработка выполняется на отдельном async worklet thread;
5. OpenCV выполняет grayscale → blur → Canny → contours → quadrilateral filtering;
6. координаты углов переводятся из Frame space в Camera space и затем в Preview space;
7. найденные четырёхугольники рисуются поверх камеры и остаются кликабельными;
8. нажатие открывает локальное изображение карты на весь экран.

**Идентификация карты пока mock:** любой найденный четырёхугольник подписывается как `ll-001` (`Огнегривый`). Это позволяет отдельно настроить геометрическую детекцию перед подключением ORB.

## Локальный запуск Android

Требования:

- Node.js 22.13+;
- Android SDK / Android Studio;
- физическое Android-устройство или эмулятор с камерой.

После изменения native dependencies обязательно пересобрать development build:

```bash
npm ci
npm run prebuild
npm run android
```

После первого native build дальнейшую JS/TS-разработку можно запускать через:

```bash
npm start
```

VisionCamera/OpenCV являются native dependencies, поэтому обычного Expo Go недостаточно — нужен development/native build.

## Архитектура CV

```text
Camera Frame Output
   |
   v
OpenCV shape detector
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
