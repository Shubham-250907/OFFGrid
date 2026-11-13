# OFFGRID Release & Deployment Guide

## 1. Prerequisites

To build and package the production signed Android APK for OFFGRID, ensure your development workstation meets the following requirements:

- **Node.js**: v18.x or v20.x LTS
- **JDK (Java Development Kit)**: OpenJDK 17 (Required by Android Gradle Plugin 8.x)
- **Android SDK**:
  - `compileSdkVersion`: 34 (Android 14)
  - `targetSdkVersion`: 34 (Android 14)
  - `minSdkVersion`: 26 (Android 8.0 Oreo)
  - Android SDK Build-Tools: 34.0.0
- **Android NDK**: 25.1.8937393 or compatible
- **ADB (Android Debug Bridge)**: Installed and added to system PATH

---

## 2. Release Keystore Generation

If you have not already created a dedicated release signing key, generate an official RSA 2048-bit keystore using Java `keytool`:

```bash
keytool -genkeypair -v \
  -keystore android/app/offgrid-release-key.keystore \
  -alias offgrid \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=OFFGRID Disaster Coordination, OU=Engineering, O=OFFGRID, L=Bangalore, ST=Karnataka, C=IN"
```

> [!CAUTION]
> Never commit `offgrid-release-key.keystore` or its passphrase to public Git repositories. Keep a secure, encrypted backup of this key.

---

## 3. Signing Environment Configuration

### Option A: Via Environment Variables (Recommended for CI/CD)
Set the following environment variables prior to running the Gradle build:

**On Linux / macOS:**
```bash
export OFFGRID_RELEASE_STORE_PASSWORD="<your-store-password>"
export OFFGRID_RELEASE_KEY_ALIAS="offgrid"
export OFFGRID_RELEASE_KEY_PASSWORD="<your-key-password>"
```

**On Windows (PowerShell):**
```powershell
$env:OFFGRID_RELEASE_STORE_PASSWORD="<your-store-password>"
$env:OFFGRID_RELEASE_KEY_ALIAS="offgrid"
$env:OFFGRID_RELEASE_KEY_PASSWORD="<your-key-password>"
```

### Option B: Via Local Gradle Properties
Add the following properties to `~/.gradle/gradle.properties` (or `android/gradle.properties` on a private workstation):

```properties
MYAPP_UPLOAD_STORE_FILE=offgrid-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=offgrid
MYAPP_UPLOAD_STORE_PASSWORD=<your-store-password>
MYAPP_UPLOAD_KEY_PASSWORD=<your-key-password>
```

---

## 4. Building the Signed Android Release APK

### Step 1: Verify TypeScript & Automated Tests
Before building the native binary, verify strict TypeScript compilation and run all 40 automated test suites:

```bash
npx tsc --noEmit
npx vitest run
```
Expected result: **0 TypeScript errors, 118/118 tests passed**.

### Step 2: Bundle JavaScript & Assets
Bundle the React Native JavaScript production bundle:

```bash
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res/
```

### Step 3: Compile Signed Release APK

**On Linux / macOS:**
```bash
cd android
./gradlew clean assembleRelease
```

**On Windows (PowerShell):**
```powershell
cd android
.\gradlew.bat clean assembleRelease
```

The compiled and signed release APK will be generated at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## 5. Verifying the Release APK Signature

Verify that the APK has been signed with APK Signature Scheme v2/v3:

```bash
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk
```

Expected output:
```text
Verifies
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Signer #1 certificate DN: CN=OFFGRID Disaster Coordination...
```

---

## 6. Sideloading & Physical Field Installation

In an air-gapped disaster environment without Google Play Store access, distribute and install the APK via ADB or local USB OTG / SD card storage.

### Installation via ADB:
```bash
adb install -r -d android/app/build/outputs/apk/release/app-release.apk
```

### Required Field Permissions Configuration:
Upon first launch on Android 12+ (API 31+) and Android 14+ (API 34+), grant the following permissions:
1. **Location**: Select *"Allow while using app"* (required for hardware GNSS access).
2. **Nearby Devices**: Select *"Allow"* (grants `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`).
3. **Notifications**: Select *"Allow"* (required for persistent foreground service on Android 13+).
4. **Battery Optimization**: Open *App Info > Battery* and select **"Unrestricted"** (prevents OEM power managers from killing BLE discovery in the background).

---

## 7. Air-Gap Acceptance Checklist

Before deploying devices into field rescue zones, execute this 5-point verification checklist:

- [ ] **Airplane Mode Check**: Enable Airplane mode. Verify Bluetooth and Location remain active. Confirm the dashboard shows the "OFFLINE" indicator and "MESH ACTIVE".
- [ ] **Zero-Data State Check**: Launch the app on a fresh install. Verify the dashboard displays an empty state (*"No active emergencies in local mesh range"*). Confirm zero crash dialogs.
- [ ] **Two-Device Radio Check**: Open OFFGRID on Phone A and Phone B. Within 15 seconds, confirm Phone A appears in Phone B's Mesh Status peer list (`BLE`).
- [ ] **Distress Signal Check**: Tap `[ SEND SOS ]` on Phone A. Confirm Phone A immediately saves the distress record locally, and Phone B receives and sounds the high-contrast emergency card.
- [ ] **Community Verification Check**: Report a test hazard on Phone A. From Phone B, cast a `[ CONFIRM ]` vote. Confirm the confidence score recalculates to `HIGH_CONFIDENCE` with proximity weight applied.
