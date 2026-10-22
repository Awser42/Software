# AliExpress Product Archiver

Windows desktop app with Playwright Chromium included. Paste 15, 20, 30 or more AliExpress product links and save each completed product as an Excel workbook with JPEG photos. Login and CAPTCHA are manual; missing information is never invented.

## Install on Windows

Existing installations: apply the **1.4.7 small update** through Settings. It fixes incomplete design/size/hoop pricing and hardens history recovery, queue errors and browser security without downloading the runtime again.

New installations can use the optional **1.4.7 Lite Setup** from [GitHub Releases](https://github.com/Awser42/Software/releases/latest). Lite omits bundled Chromium; the pinned browser downloads once on first use and is kept in your user profile. This reduces the installer download, not the total disk space needed after Chromium is installed. No Node.js is required. The earlier [full 1.4.3 Setup](https://github.com/Awser42/Software/releases/download/v1.4.3/AliExpress-Product-Archiver-1.4.3-Setup.exe) remains available with Chromium included, followed by the same small update. Requires Windows 10/11 x64.

1. Quit an older portable copy through its system-tray **Quit** command.
2. Run Setup, choose an installation folder and launch the app from its shortcut.
3. Click **Show Chromium / Login**, sign into AliExpress and choose your country/currency. Click **Hide Chromium** when finished.
4. Choose an output folder and paste URLs into the numbered cells. Multiline or tab-separated Excel cells fill consecutive rows automatically.
5. Click **Run all links**. Each product ZIP is saved immediately while the queue continues. Pause/resume, retry failed links and duplicate skipping are available.
6. If verification appears, show Chromium, complete it, then click **Continue after login / CAPTCHA** in Progress. Resume if you paused manually.

**Roman Urdu:** Setup install karein, Chromium mein login karein, folder choose karke links paste karein aur Run karein. Har product ki ZIP mein sirf **product.xlsx** aur **Images/** hongay; CSV nahi banegi. Excel ki Variations sheet mein variation name ke saath uski apni confirmed price hogi.

The compact workspace has responsive navigation, live queue activity, searchable/sortable Downloads, grid/list views and incremental history loading. Lightweight CSS transitions respect the system's reduced-motion setting. The desktop window can be resized down to 380 pixels; the layout is separately checked down to 360 pixels.

Unchanged archive cards, photos and open previews are reused during progress updates. Hidden views are not rebuilt, and bursts of notifications are coalesced. Windows browser controls reuse one native helper rather than starting/compiling PowerShell for each command; it still verifies Chromium's process identity, and closes with the browser. Visible-price settling/confirmation waits and source-image quality are unchanged. These optimizations do not promise a fixed speedup for live pages or slow networks.

The installer is unsigned. Settings, login profile and archive history stay under your Windows user account. Exported product ZIPs are saved to your chosen folder.

See [COMMERCIAL-READINESS.md](COMMERCIAL-READINESS.md) for the review, fixed issues and remaining release-owner requirements. This is not a claim of commercial certification.

## Excel-only export

Every new product ZIP contains only:

| File/folder | Contents |
| --- | --- |
| `product.xlsx` — Product Details | Observed title, product URL, capture time, description, independent seller description, features and specifications |
| `product.xlsx` — Variations | Variation name, confirmed visible price, size, color, title and matching image filenames |
| `Images/*.jpg` | Available main, variation and description photos converted to genuine JPEG files |

Extract the ZIP before opening the workbook. Excel sheets have readable widths, wrapped text and frozen headers; the variation list can be filtered. Variation and its price are adjacent. Long descriptions continue over labeled rows without losing text. Formula-like source text remains literal text. No CSV, JSON, HTML or extra reports are generated. Earlier exports remain available and are labeled by their earlier format. Add old links again to capture the new Excel-only format even when duplicate skipping is enabled.

Prices and controls are captured before lazy description/specification tabs can unmount the main product panel. Modern price/SKU controls and title labels without colons are supported. If catalog attributes do not map to any visible option plan, the app explores actual enabled UI choices. Required unselected groups are selected from real enabled controls and settled before recording complete combinations. Prices come from the visible current-price field after selecting and confirming the corresponding variation. Hidden catalog amounts, crossed-out amounts, coupons and shipping prices are not substituted. Missing or unconfirmed prices remain blank. Unknown option combinations are not invented. Displayed currency is preserved. Increase **Page / variation settling time** if the page updates slowly.

Partial catalogs no longer limit capture to one size/hoop per design. Each actual enabled design + size + hoop/pack combination is selected and freshly confirmed, with its own Excel price and matching cost-labelled images. A stale selected-SKU marker cannot override the visible selected options. Already visited combinations are skipped; bounded discovery warns if additional combinations remain. Re-add earlier links for the new v8 capture format; earlier ZIPs remain untouched.

Description prefers the substantive visible AliExpress AI overview, including its actual disclaimer and text. This is observed page content; the software does not generate a summary. If unavailable, the lower seller description is used. Independent seller content and exposed description images are also captured from the observed DOM, lazy tabs, inline modules, endpoints and frames. If no description is exposed, the cells remain blank and the app displays a warning. Specifications and photos are not converted into invented prose.

Original/CDN image sizes are used when exposed. PNG/WebP/other supported sources are decoded into genuine JPEGs. Tiny icons, semantic UI controls, avatars and unrelated sources are filtered. Shared sources are downloaded and decoded once. Each variation's photos, including common gallery/description photos, have its own observed options and confirmed cost, for example `variation-Color-Blue-Size-20_20cm-cost-$8.15-1-001.jpg`. If two sizes share a photo but have different prices, each gets its own named copy; its Excel row points only to that size's copies. US/USD amounts are written with `$`; other observed currencies are preserved, not falsely converted. Choose USD in your AliExpress session for dollar prices. Missing confirmed costs are omitted, not replaced with hidden catalog prices. Recapture earlier products to get the new naming; old ZIPs are unchanged. Previews retain original photo proportions. Download failures appear as warnings without discarding other product data.

## Delete records

Downloads has a sticky **Clear Downloads history** button and **Delete record** above every product photo. Confirmation defaults to Cancel. Only saved history and completed queue entries are removed. Failed Links, exported ZIPs, pending/running products, pasted unsent links, settings and browser login are preserved. Downloads history can be cleared while processing continues; future completions appear normally. Deleted records stay deleted after restarting, and their links can be added again.

## Failed Links

An extraction failure automatically moves that product into the in-app **Failed Links** folder; other products continue processing. Previously saved failed records appear there too. Search by URL, product or error, see the failure reason/time and attempt count, copy individual/all URLs, or export one URL per line to a chosen `.txt` file. No product ZIPs are moved or deleted.

After the current run finishes, retry one link or all failures. Retried links return to Progress; success leaves the failure folder, while another failure returns with the latest error and attempt count. Failures survive restart and are not removed by Downloads history clearing or clearing completed queue entries. Removing one/all failures requires a Cancel-first confirmation and preserves active products, downloads, settings and login.

## Background work

History uses flushed atomic replacement and a local mirror backup. A damaged primary file is preserved and restored from a valid backup; unrecoverable history stops startup instead of silently starting over. Deletions are mirrored too. Output-folder errors keep pending work retryable, and the folder cannot be changed during a run. Keep an external backup of valuable archives/profile data; a local mirror is not a device-loss backup.

On Windows, Chromium's own windows are fully hidden by default, not merely minimized. **Hide Chromium** identifies Chromium through CDP and targets only its process; the software stays visible. **Show Chromium / Login** restores the tab needing verification in the same persistent login session. Linux uses the available window-manager minimize behavior. Login/verification pauses processing without forcing Chromium forward.

**Settings > Hide software to tray** or Close hides the software itself when tray behavior is enabled. This is separate from Hide Chromium. Reopen from the tray; choose **Quit** to stop completely. Turn off **Keep working in the tray** for normal close-to-quit behavior. Keep the computer awake while processing.

Products use **3 concurrent Chromium tabs** by default, configurable from 1 to 4 under **Parallel product tabs**. Tabs share login but keep responses, selections, prices and output isolated per product. Completed tabs close automatically. Pause applies to all workers; Continue resumes outstanding manual verification requests. Lower the tab count if the site challenges the session frequently.

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
npm run audit:dependencies
bash scripts/test-ui-linux.sh
```

Unit tests cover extraction, visible prices, blank/stale prices, JPEG decoding, size/cost filenames, Excel-only archives, concurrency, pause/verification, history deletion and verified updates. The desktop batch checks 31 workbooks and 372 size-cost JPEG files, then clears history during a paused active run and verifies queued processing continues without deleting ZIPs. Controlled fixtures supply remote content; production extraction, queue and archive code run unchanged. `node test/records.e2e.js` separately checks deletion cancellation, restart persistence and preservation of exports, pending products, unsent links, settings and browser profile.

The **Small Windows code update** workflow reuses the checksum-verified released 1.4.3 runtime to test compatibility. It runs source desktop/unit tests and `test/code-update.e2e.js`, applies the exact new code ZIP through the existing EXE updater, then checks native hide/show, one reusable window helper, a visible software window, three overlapping product tabs with different size prices and persistent shared login. It additionally builds the optional smaller Lite Setup and tests actual installation, launch, external pinned browser-cache use and uninstall. The test seeds that cache from the verified release; it does not claim a live first-browser download.

`node test/failures.e2e.js` checks the real desktop failure folder, restart persistence, actual clipboard text, native export cancellation and text contents, isolated retry, repeated failure and confirmed removal with ZIP preservation. Its extraction fixture intentionally supplies failures/successes; real browser/extraction behavior is covered separately by the batch test.

`node test/layout.e2e.js` checks all five screens at 360/390/520/768/1024/1440 pixels, populated failure rows, search, sorting, grid/list modes, pagination and stable archive-path actions. With 2,000 fixture records and 500 coalesced progress notifications, it asserts no download-card child rebuilding, retained photo identity and an open preview. Timings are machine-dependent; the report records actual observed milliseconds rather than a fixed percentage performance claim. The source-only UI adds no web framework or external fonts; only 40 selected, licensed Lucide icons are bundled.

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

For the smaller installer, use `npm run build:win:lite` instead of the full browser-bundling build. It outputs `dist-lite/*-Lite-Setup.exe` and excludes the Chromium extra resource. Browser installation uses the pinned headed browser without downloading the unused headless shell. `npm run build:icons` regenerates the checked-in small icon sprite from the development-only icon package.

Use `E2E_BUNDLED=1` for the desktop test to exercise the shipped browser; set it in your shell before running that test. `npm run build:win` downloads the pinned Windows Chromium and builds Setup directly. Browser binaries are generated resources, not committed to Git.

The GitHub Windows workflow requires passing unit, 30-product desktop, packaged EXE and actual installer acceptance before publishing. A distribution-test retry can reuse completed batch/Setup artifacts only after Git and authenticated job records verify unchanged application, dependency, browser and fixture inputs. Installed source/browser bytes and actual installed export/update/uninstall checks still run again. Installer acceptance silently installs per user, checks the actual HKCU uninstall registration, launches the installed app to verify Excel/JPEG and a synthetic future code update, clicks the installed app's Uninstall software button and confirms its application files/registration disappear while separate exports remain. Only the native test appends the vendor /S argument to automate confirmation; the normal product retains the native confirmation window. Native Windows minimizes/restores Chromium and tests background/tray behavior. These results are separate from Linux tests.

`Live-product-check.json` records the anonymous live AliExpress attempt. A manual-login/verification result does not establish live fields or account-specific prices. No supplied real account session is present in fixtures or CI. See [VALIDATION.md](VALIDATION.md) for recorded results and their limits.
