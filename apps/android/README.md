# Diner Dost Android

Native Android preview, version **0.2.0**. The UI uses Kotlin and Android Views. There is no WebView, HTML renderer or Open in browser action. The app talks to the existing authenticated JSON API and uses the same restaurant database and individual staff accounts.

The toolbar bell shows the unread count. Its native inbox includes table activation/service requests, new orders, released/ready kitchen tickets, payment receipts and owner alerts, filtered by current role, outlet and waiter assignment. Read state is stored per employee on the server; older notifications load in pages. Notifications open native screens. Firebase is not required for the inbox.

## Source

- `MainActivity.kt`: account lifecycle, native navigation, data loading and foreground polling.
- `data/`: JSON API transport and an Android Keystore encrypted session store. Passwords are not saved.
- `ui/`: native operations, orders/POS, documents/QR, floor plan, team, menu, records, inventory and settings screens, plus shared controls and the bell.
- `notifications/`: Android channels, bundled sound and the guarded Firebase receiver.
- `settings/`: native notification permission, sound/vibration controls and Firebase setup status.

## Build

Open this folder in Android Studio, or use JDK 17 and Android SDK platform/build tools 36:

```powershell
./build.ps1
```

On this PC the script locates portable tools outside the codebase without changing global environment variables. Elsewhere configure `JAVA_HOME` and `ANDROID_HOME`. The build runs APK assembly, native route-policy tests and Android lint. Output: `app/build/outputs/apk/debug/app-debug.apk`. Debug APKs are for testing; Play Store distribution needs private release signing and device acceptance.

Production API origin: `https://dinerdost-app.vercel.app`. A local emulator build uses:

```powershell
./build.ps1 -PreviewOrigin http://10.0.2.2:5090
```

Run the local Next server with `APP_ORIGIN=http://10.0.2.2:5090`, `LOCAL_DATABASE_PATH=.data/android-native-026`, and no production database variables. The explicit origin preserves the existing CSRF check. Release builds always use HTTPS production. Instrumented workflows only run against this isolated local origin.

## Scope and remaining acceptance

Native screens exist for staff operations and management. This is a native preview, not a claim that every advanced web control or full PRD capability has native acceptance. The web remains the approved full interface. [Android setup and acceptance](../../docs/ANDROID.md) records tested workflows, parity limits and Firebase work. No financial writes are queued offline; an internet connection is required.

The superseded **0.1.0 APK was a WebView wrapper** and must not be distributed as this replacement.
