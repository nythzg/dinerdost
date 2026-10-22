# Android native replacement · 20 October 2026

Version **0.2.0** replaces the rejected 0.1.0 WebView wrapper with native Kotlin / Android Views. Authentication and restaurant data use the existing JSON backend. There is no browser fallback. Package: `com.dinerdost.app`.

## Implemented

- Native sign-in, staff invite acceptance, sign-out, per-role large navigation, outlet selection and Android back navigation.
- Native overview, tables, activation approval, separate table bills, move/swap, service requests and kitchen transitions.
- Native POS/cart with item quantities, variants/modifiers and notes; order acceptance/rejection, identity, reward review, one-step receipts, serve/settle and invoice viewing/printing.
- Owner tax/named-charge controls and temporary customer device bans reuse server enforcement.
- Native table QR generation/printing and a saved floor-plan canvas; owner/manager arranging and fixtures.
- Native team invites and role/outlet/access editing; menu/recipe, inventory receipts, customer lists, record forms, attendance/shifts, outlet settings and audit viewing.
- Notification bell, unread count and paged per-account inbox. Read/unread status survives restart and is isolated by restaurant, role, outlet and waiter assignment. Only safe business summaries are returned, with no raw audit payload or customer identity.
- Foreground polling and Android notification channels with the bundled alert sound. Initial history stays quiet; subsequent eligible events alert once in the running app. Read-only polling never extends a table's idle timer.
- Session tokens encrypted using Android Keystore; no saved passwords, app backup or JavaScript bridge.

## Verification

Build, JVM route-policy tests, Android lint, API isolation and Android emulator workflow results are recorded in `VERIFICATION.md` and `verification/android-native-build.json`. The emulator is an API 36 Google APIs image on Windows Hypervisor Platform. Device screenshots are in `verification/android-native/`.

This preview does not claim full native parity or complete phone acceptance. In particular, advanced coupon/points selection and verification, uncertain-payment reconciliation, every menu-option/category editor, rich report exports and all inventory/admin combinations need additional native coverage. Existing backend rules remain enforced; a missing native control never opens a browser. The four user-deferred external integrations are still setup-only.

## Firebase background setup still required

1. In the existing Firebase project **diner-dost**, download the Android client `google-services.json` for **com.dinerdost.app** and place it in `apps/android/app/`. No duplicate app registration is needed. The file is still absent; no configuration values have been invented.
2. Configure an authenticated server installation registration bound to the current employee and allowed outlets. Revoke it on sign-out, role/outlet removal or account disable.
3. Add an FCM sender using a narrowly scoped server identity held in server secrets. Never bundle a private key in the APK. Dispatch durable outbox events with recipient checks, deduplication, expiry/retry handling and invalid-device cleanup.
4. Rebuild and verify background/closed-app alerts on a phone. The receiver refuses unbound business push messages until the server connection exists.

The native inbox works independently of Firebase. Compilation and emulator checks do not prove live background delivery or audible sound on a physical device. Android volume, notification permission and Do Not Disturb affect alert sound.

Official setup: [Firebase Android](https://firebase.google.com/docs/android/setup), [FCM Android](https://firebase.google.com/docs/cloud-messaging/android/get-started), [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission).

## Remaining distribution checks

- Real phone notification permission, sound/vibration, rotation, network recovery and printer/PDF acceptance.
- Full role-by-role native parity acceptance for the client's remaining operational cases.
- After Firebase server integration: background and closed-app delivery, token rotation, revoked access and duplicate suppression.
- Private release signing key, release bundle, privacy/store material and Play Console distribution when requested.

## Native 0.2.0 build result

The signed debug APK is `outputs/android/DinerDost-native-0.2.0-debug.apk` (4,934,567 bytes). APK v2 signature verification, one native-route JVM test and Android lint passed (0 errors, 17 warnings).

The API 36 emulator passed the complete local workflow: sign-in, notification read state, staff activation, POS/payment/kitchen/final invoice, member/vendor edits and separate Cashier/Waiter/Chef access. The production-origin APK then passed live HTTPS sign-in and inbox checks using dedicated QA staff, plus OS notification display, native notification tap and sound-channel resource checks. The dedicated production QA staff account was disabled afterwards. No physical phone, physical audible-sound acceptance or FCM background delivery is claimed.
