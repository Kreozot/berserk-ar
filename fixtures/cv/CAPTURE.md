# Capturing real CV regression frames

Use the Pixel 7 Pro and a development build. The capture UI is unavailable in production builds and does not appear during the normal `npm run start` or `npm run android:device` flows.

## Start capture mode

Connect the device with USB debugging enabled, then run:

```sh
npm run capture:android
```

Stop any existing Expo/Metro session before starting the command. It builds and opens the Android development app with fixture capture enabled. The normal detector, ORB, tracker, and overlays continue running while the capture controls remain isolated from their state.

## Save frames

1. Tap **Выбрать папку** and choose or create an empty export folder.
2. Arrange a physical scene from the collection plan in `README.md`.
3. Wait for autofocus and exposure to settle.
4. Tap **Снять кадр** once.
5. Confirm that the panel shows the filename and image dimensions.
6. Change the scene before taking the next frame.

The mode saves a 100-quality JPEG from VisionCamera's active preview. React Native overlays are not part of that preview snapshot. Files use sortable UTC names such as `berserk-cv-20260905T123456789Z.jpg`.

After the session, copy the whole selected folder without messenger compression and include a short note mapping filenames to scene categories and expected card positions/IDs. Each accepted image will later become its own `fixtures/cv/<scene>/frame.jpg` directory with a reviewed `expected.json` annotation.

Do not rename or edit the exported originals before handing them off. Do not treat a successful save as proof that detection or recognition passed; capture mode only records evidence for later regression evaluation.
