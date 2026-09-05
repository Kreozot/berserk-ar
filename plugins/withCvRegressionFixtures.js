const { copyFile, mkdir, readdir, rm } = require('node:fs/promises');
const path = require('node:path');

const { withDangerousMod } = require('@expo/config-plugins');

/** Copies real frames only into the Android debug source set, keeping them out of release APKs. */
module.exports = function withCvRegressionFixtures(config) {
  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const sourceRoot = path.join(androidConfig.modRequest.projectRoot, 'fixtures', 'cv');
      const targetRoot = path.join(
        androidConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'debug',
        'assets',
        'cv-fixtures',
      );

      await rm(targetRoot, { recursive: true, force: true });
      await mkdir(targetRoot, { recursive: true });
      const entries = await readdir(sourceRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        await copyFile(
          path.join(sourceRoot, entry.name, 'frame.jpg'),
          path.join(targetRoot, `${entry.name}.jpg`),
        );
      }
      return androidConfig;
    },
  ]);
};
