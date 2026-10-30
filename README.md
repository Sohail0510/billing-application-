# Hisaab Billing

A GST billing and accounting app for Android, in the style of myBillBook. Everything is stored on the phone; no account, server or internet connection is needed.

<img src="icon-512.png" width="96" alt="App icon">

## What it does

- **Sales invoices** that print like your current ones: tax-inclusive or exclusive prices, CGST + SGST within the state and IGST across states, HSN-wise tax summary, amount in words, round-off, received and balance amounts.
- **Quotations** that convert to invoices in one tap, **credit notes** (sales returns) and **debit notes** (purchase returns).
- **Purchases**, **Payment In / Payment Out** and **expenses** (with GST input credit).
- **Parties** with GSTIN check, auto-filled state and PAN, opening balances, running statements and WhatsApp payment reminders.
- **Items and stock**: HSN/SAC, units, GST rate, opening stock, low-stock alerts, stock movement per item.
- **Reports**: Sales, Purchases, GSTR-1 (B2B, B2C Large/Small, credit notes, HSN), GSTR-3B summary, HSN summary, Profit & Loss, item-wise sales, stock summary, receivables and payables, day book and expenses. Each one shares as a spreadsheet (CSV).
- **PDF invoices** shared straight to WhatsApp, Gmail or Drive, or saved to `Downloads/Hisaab`.
- **Scan label**: take a photo of a product label and the model no. and serial no. are read on the phone (no internet). Each unit is saved in **Downloads/Hisaab/Stock.xlsx**, one row per serial number, and that file is updated every time you save a unit or sell one.
- **Inventory from scanning**: every scanned unit adds one piece to the item's stock, and a product that isn't in the item list is added automatically. Each unit records its purchase price, so stock, purchases and sales stay in step. Don't also add the same serial-numbered units on a purchase bill, or they count twice (the app warns you).
- **Serial numbers on invoices**: when you add a line for an item, pick the units you are selling. They are marked as sold to that invoice in the stock sheet, and go back in stock if the invoice is deleted.
- **Backup and restore** as a single file, plus dark mode and the Android back button.
- **Voice assistant** (English and Hindi): tap the mic on the main screens to open a screen ("open sales report", "new payment in"), ask a question ("how much does Ali owe?", "sales this month") and hear the answer, or dictate an invoice ("invoice for Ali, 2 fans at 1500"). A dictated invoice opens in the form for you to check; nothing is saved automatically.

## Get the APK

### Option 1: Let GitHub build it (no computer needed)

1. Create a new repository on GitHub and upload this whole folder to it (keep the folder structure, including `.github`).
2. GitHub runs the **Build Android APK** workflow automatically (see the **Actions** tab). It takes about 5 minutes.
3. Open the repository's **Releases**, tap **Latest APK**, download `hisaab-billing.apk` on your phone and open it.
4. Android asks to allow installing from your browser or Files app the first time. Allow it, then install.

Every push to `main` builds a fresh APK and replaces the **Latest APK** release.

### Option 2: Android Studio

1. Open the `android` folder in Android Studio (Narwhal or newer).
2. Wait for Gradle sync, then **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
3. The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Option 3: Command line

Needs JDK 17 and the Android SDK (platform 36).

```bash
cd web && npm install && node build.mjs   # only if you changed the app screens
cd ../android && ./gradlew assembleDebug
```

## Changing the app

The screens are a React app in `web/src`. After editing, run `node build.mjs` inside `web`: it bundles everything into one file and copies it to `android/app/src/main/assets/www/index.html`, which the Android app loads. The GitHub workflow does this step for you.

| Path | What it holds |
| --- | --- |
| `web/src/lib/gst.js` | State codes, GST rates, GSTIN checksum, invoice arithmetic |
| `web/src/lib/ledger.js` | Party balances, paid/unpaid status, stock |
| `web/src/lib/reports.js` | All reports |
| `web/src/pdf/` | Invoice PDF writer (A4, same layout as the sample) |
| `web/src/screens/` | Every screen |
| `android/app/src/main/java/…/MainActivity.java` | WebView host, file picker, back button, edge-to-edge |
| `android/app/src/main/java/…/AppBridge.java` | Share PDF, save to Downloads, open WhatsApp links |
| `web/src/lib/voice.js` | Voice commands (English and Hindi), spoken-invoice parsing, speech helpers |
| `web/src/screens/Voice.jsx` | Mic button and voice sheet |
| `web/src/lib/units.js` | Label reading (model and serial), stock rows |
| `web/src/lib/xlsx.js` | Excel (.xlsx) writer, no dependencies |
| `web/src/lib/stockSheet.js` | Rebuilds Stock.xlsx; marks units sold or back in stock |
| `web/src/screens/Scan.jsx` | Scan label screen |

Tests (need Playwright's Chromium): `npm run test:pdf` recreates invoice 621 as a PDF, and `tests/smoke.mjs` and `tests/bridge.mjs` click through the main flows against `dist/index.html`. `node tests/units.mjs`, `node tests/xlsx-check.mjs` and `node tests/scan-ui.mjs` check label reading, the Excel file and the scan-to-sale flow with a fake bridge; `node tests/upgrade-check.mjs` checks that an existing install upgrades without losing data. `npm run test:voice` checks the voice commands (`tests/voice.mjs`) and the voice screens with a fake phone bridge (`tests/voice-ui.mjs`); the microphone and speech themselves need a real phone.

## Before you rely on it

- **Back up regularly.** Data lives only on the phone. Uninstalling the app or clearing its storage deletes it. Use Settings → Backup & restore → Share backup file, and send it to Google Drive or to yourself on WhatsApp.
- **GST reports are a working summary.** Check GSTR-1 and GSTR-3B totals against the GST portal or with your accountant before filing. E-invoicing (IRN/QR) and e-way bills are not included.
- **One phone, one user.** There is no sync between devices.
- **Voice needs internet** on most phones (Android's speech service). It asks for microphone permission the first time you use it. Telugu is not supported yet.
- **PDF text is English (Latin script).** Names typed in Telugu, Hindi or Urdu show as `?` in the PDF, though they display fine in the app.
- **Play Store:** the GitHub build is a debug APK for installing directly. For the Play Store, create a signing key, add a `signingConfig` to `android/app/build.gradle` and build `bundleRelease`.

The invoice font is Carlito (SIL Open Font License); headings use Poppins (SIL Open Font License).
