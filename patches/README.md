# Native OpenCV patch

`react-native-fast-opencv+1.0.1.patch` guards empty Mats before calling
`elemSize()` when reporting external memory to the JavaScript runtime.
ORB can legitimately produce a default-constructed empty descriptor Mat when
no keypoints are found. OpenCV 4.12.0 debug builds assert in `elemSize()` for
that Mat, before JavaScript receives the result and can return UNKNOWN.

The empty Mat owns no pixel buffer, so its external memory size is zero.
Nonempty Mats retain the existing size calculation. Processing exceptions
continue to propagate; this patch does not catch or suppress them.

`npm ci` / `npm install` apply the patch through the `postinstall` hook and fail
if it cannot be applied. After installing it, rebuild the native app (a Metro
reload is insufficient). Run `npm run android:cv-regression`; specifically
check that `perspective-gnome-quarter-turn` no longer reports an `elemSize`
ERROR. Its geometry FAIL may remain because detector accuracy is unchanged.

When upgrading react-native-fast-opencv, check whether upstream includes this
guard before updating or removing the patch. Unit tests cover handling an
empty descriptor result, but the native assertion requires an Android debug
build for verification.
