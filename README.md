# AliExpress Product Archiver

Windows desktop app with Playwright Chromium included. Paste 15, 20, 30 or more AliExpress product links and save each completed product as an Excel workbook with JPEG photos. Login and CAPTCHA are manual; missing information is never invented.

## Install on Windows

Download **AliExpress-Product-Archiver-1.4.2-Setup.exe** from [GitHub Releases](https://github.com/Awser42/Software/releases/latest). Requires Windows 10/11 x64. Chromium is included; no Node.js or separate browser download is needed.

1. Quit an older portable copy through its system-tray **Quit** command.
2. Run Setup, choose an installation folder and launch the app from its shortcut.
3. Click **Show Chromium / Login**, sign into AliExpress and choose your country/currency. Click **Hide Chromium** when finished.
4. Choose an output folder and paste URLs into the numbered cells. Multiline or tab-separated Excel cells fill consecutive rows automatically.
5. Click **Run all links**. Each product ZIP is saved immediately while the queue continues. Pause/resume, retry failed links and duplicate skipping are available.
6. If verification appears, show Chromium, complete it, then click **Continue after login / CAPTCHA** in Progress. Resume if you paused manually.

**Roman Urdu:** Setup install karein, Chromium mein login karein, folder choose karke links paste karein aur Run karein. Har product ki ZIP mein sirf **product.xlsx** aur **Images/** hongay; CSV nahi banegi. Excel ki Variations sheet mein variation name ke saath uski apni confirmed price hogi.

The top Features strip lists Excel-only exports, variation names/prices, JPEG photos, bulk links and background processing.

The installer is unsigned. Settings, login profile and archive history stay under your Windows user account. Exported product ZIPs are saved to your chosen folder.

## Excel-only export

Every new product ZIP contains only:

| File/folder | Contents |
| --- | --- |
| `product.xlsx` — Product Details | Observed title, product URL, capture time, description, independent seller description, features and specifications |
| `product.xlsx` — Variations | Variation name, confirmed visible price, size, color, title and matching image filenames |
| `Images/*.jpg` | Available main, variation and description photos converted to genuine JPEG files |

Extract the ZIP before opening the workbook. Excel sheets have readable widths, wrapped text and frozen headers; the variation list can be filtered. Variation and its price are adjacent. Long descriptions continue over labeled rows without losing text. Formula-like source text remains literal text. No CSV, JSON, HTML or extra reports are generated. Earlier exports remain available and are labeled by their earlier format. Add old links again to capture the new Excel-only format even when duplicate skipping is enabled.

Prices and controls are captured before lazy description/specification tabs can unmount the main product panel. Modern price/SKU controls and title labels without colons are supported. If catalog attributes do not map to any visible option plan, the app explores actual enabled UI choices. Required unselected groups are selected from real enabled controls and settled before recording complete combinations. Prices come from the visible current-price field after selecting and confirming the corresponding variation. Hidden catalog amounts, crossed-out amounts, coupons and shipping prices are not substituted. Missing or unconfirmed prices remain blank. Unknown option combinations are not invented. Displayed currency is preserved. Increase **Page / variation settling time** if the page updates slowly.

Description prefers the substantive visible AliExpress AI overview, including its actual disclaimer and text. This is observed page content; the software does not generate a summary. If unavailable, the lower seller description is used. Independent seller content and exposed description images are also captured from the observed DOM, lazy tabs, inline modules, endpoints and frames. If no description is exposed, the cells remain blank and the app displays a warning. Specifications and photos are not converted into invented prose.

Original/CDN image sizes are used when exposed. PNG/WebP/other supported sources are decoded into JPEG; changing a filename alone is not conversion. Existing JPEG bytes are retained when possible. Tiny icons, semantic UI controls, avatars and unrelated sources are filtered; identical image contents share one saved file. Small genuine pictures below the quality threshold may be omitted. Previews retain original photo proportions. Unavailable originals cannot be recovered; download failures appear as warnings without discarding the other product data.

## Background work

Chromium runs minimized by default in the same persistent headed session. Use **Show Chromium / Login** and **Hide Chromium**; this keeps your existing login. Login/verification pauses the queue without forcing Chromium forward.

**Run in background** or Close hides the software to its system tray when enabled in Settings. Reopen it from the tray; choose **Quit** to stop completely. Turn off **Keep working in the tray** for normal close-to-quit behavior. Keep the computer awake while processing.

## Small updates

Existing **1.4.0 or later** users can choose **Settings → Check for updates → Download small update → Restart to apply**. Compatible code updates are normally tens of kilobytes and reuse installed Chromium/Electron. The queue must finish before restart. Updates verify the manifest, ZIP size and SHA-256, every source-file hash and safe archive paths. A failed startup rolls back. Runtime or compatibility changes may require a full installer.

A code update can give an older portable copy the Excel-only export and new UI. It does **not** register that portable EXE with Windows Installed apps. Install the new **Setup.exe** once if you want standard Windows uninstall support. Do not manually extract a Code-update.zip over the EXE.

## Uninstall

Quit through the app's tray, then open **Windows Settings → Apps → Installed apps → AliExpress Product Archiver → Uninstall**. The app's **Settings → Uninstall software** button directly starts its installed Windows uninstaller, saves state, closes Chromium and quits the app. Finish the active queue first. The native confirmation window opens; this button does not merely open Windows Settings. Portable copies instead require Quit and deletion of their EXE. The installer also creates Start menu / desktop shortcuts.

Uninstall removes installed application files, bundled Chromium and Windows installation registration. Separate exported product ZIPs and the saved login/settings profile are preserved. Older portable EXEs are separate files: Quit that copy and delete its EXE when no longer needed. Removing one copy does not delete other portable copies.

## Run from source

Requires Node.js 22+ and a graphical desktop. Use the repository-pinned Electron and Playwright versions.

```sh
npm ci
node node_modules/electron/install.js
npx playwright install chromium
npm start
```

On Linux, install the Electron/Chromium system libraries and a graphical display. For the supplied dummy-display test, Xorg and its dummy video driver must be installed.

```sh
npm test
bash scripts/test-ui-linux.sh
```

Unit tests exercise extraction, exact visible variation prices, blank/stale prices, real JPEG decoding, Excel-only archives, literal/formula safety, legacy recapture and update verification/rollback. The real desktop test pastes 15/20/30 links, processes a streaming 30-product batch plus its initial product, and checks all 31 workbooks and 186 JPEGs. Controlled fixtures supply remote content; production extraction, queue and archive code run unchanged.

## Build and test Windows

On Windows:

```sh
npm ci
node node_modules/electron/install.js
npx playwright install chromium
npm run bundle:chromium
npm exec -- electron-builder --win --x64 --dir --publish never
node scripts/verify-package.js
node test/ui.e2e.js
node test/packaged.e2e.js
npm run build:update
npm exec -- electron-builder --win nsis --x64 --prepackaged dist/win-unpacked --publish never
node test/installer.e2e.js
```

Use `E2E_BUNDLED=1` for the desktop test to exercise the shipped browser; set it in your shell before running that test. `npm run build:win` downloads the pinned Windows Chromium and builds Setup directly. Browser binaries are generated resources, not committed to Git.

The GitHub Windows workflow requires passing unit, 30-product desktop, packaged EXE and actual installer acceptance before publishing. A distribution-test retry can reuse completed batch/Setup artifacts only after Git and authenticated job records verify unchanged application, dependency, browser and fixture inputs. Installed source/browser bytes and actual installed export/update/uninstall checks still run again. Installer acceptance silently installs per user, checks the actual HKCU uninstall registration, launches the installed app to verify Excel/JPEG and a synthetic future code update, clicks the installed app's Uninstall software button and confirms its application files/registration disappear while separate exports remain. Only the native test appends the vendor /S argument to automate confirmation; the normal product retains the native confirmation window. Native Windows minimizes/restores Chromium and tests background/tray behavior. These results are separate from Linux tests.

`Live-product-check.json` records the anonymous live AliExpress attempt. A manual-login/verification result does not establish live fields or account-specific prices. No supplied real account session is present in fixtures or CI. See [VALIDATION.md](VALIDATION.md) for recorded results and their limits.
