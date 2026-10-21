# AliExpress Product Archiver

Windows desktop application built with Electron and Playwright Chromium. Paste multiple AliExpress product links and save one named ZIP per product. Uses a visible, persistent Chromium profile so you can log in and complete CAPTCHA yourself.

## Windows release: no Node.js required

The single-file `AliExpress-Product-Archiver-1.1.0-win-x64.exe` is a portable launcher: run it directly. It unpacks its application resources temporarily and keeps your login/settings in your per-user app data. The matching Windows Chromium is included; no separate browser installation is needed. Product extraction still needs Internet access. Alternatively, use the ZIP distribution below.

1. Download `AliExpress-Product-Archiver-1.1.0-win-x64.zip` from the delivered `dist` folder.
2. **Extract the entire ZIP** into a writable folder. Do not run the EXE from inside the ZIP or move the EXE away from its supporting files.
3. Run **AliExpress Product Archiver.exe**. Requires Windows 10/11 x64. This build is unsigned.
4. Click **Open Chromium / Login**. The app opens its bundled Playwright Chromium immediately. Node.js and an existing Chrome installation are not required.
5. Log into AliExpress inside that Chromium window. Choose your delivery country, currency, and account settings there.
6. Select the destination folder, paste one full product URL per line, and click **Run extraction**.
7. If login or verification is requested, complete it in Chromium and click **Continue after login / CAPTCHA** on the Progress tab. If you paused the queue, also click Resume.
8. Find completed ZIP files and image previews in Downloads. Use **Show ZIP in folder** to open their location.

**Urdu:** Open Chromium / Login par click karein, apna AliExpress account login karein, phir links paste karke Run karein. App usi session ki available cost/price aur variation prices save karegi. CAPTCHA khud complete karke Continue dabayein. Jo data available nahi hoga woh banaya nahi jayega.

## What is saved

Each archive has a sanitized product title and product ID in its filename. Existing ZIPs are never overwritten.

| File/folder | Contents |
| --- | --- |
| `product.json` | All extracted fields, observed structured source modules, price context, asset URLs/status, missing-data warnings |
| `product-details.txt` | Readable title, source, observed prices, description, options, specifications, warnings |
| `description.html` | Sanitized, offline HTML with downloaded description images referenced locally |
| `variations.csv` | Exposed SKU IDs, names, attributes, observed prices, original prices and quantities |
| `specifications.csv` | Available specification names and values |
| `options.csv` | Exposed option names/values, including colors, sizes and variation-image URLs |
| `images/` | Product images from observed original/CDN URLs |
| `description-images/` | Downloaded description images |
| `variation-images/` | Available option images |

The app downloads the available original image URL rather than resizing it. CDN thumbnail size suffixes are removed where recognized; the app cannot recover an original file that AliExpress does not make available. It preserves downloaded bytes. Individual unavailable images produce warnings while the remaining archive is saved. The first available image is previewed in Downloads. A live Latest saved product panel links to each newly completed ZIP while the rest of the batch continues. You can paste 8, 10, or more links at once; each product is saved independently in the same Chromium session.

## Prices and completeness

Prices are **observations from your Chromium session**, including exposed SKU price structures and the visible price text. They are not a guaranteed final checkout total: shipping, taxes, coupons, new-user discounts, destination, currency and selected variant can change the amount. The tool does not perform checkout or convert currency. It does not guess a missing cost.

AliExpress can change its page/data structure, restrict a region or product, or show verification. The extractor reads known page modules, JSON-LD, observed product API responses and product DOM fields. This cannot guarantee every field for every live product. Missing fields remain `null` or empty, with warnings. A page without credible product content fails instead of producing an invented archive. Returned JSON includes the captured source modules; it is not a dump of the entire AliExpress site or account.

Only full `/item/NUMBER.html` or `/i/NUMBER.html` links on `aliexpress.com`, `aliexpress.us` and their subdomains are accepted. Tracking queries are stripped. Short affiliate links must first be opened and resolved to the full product URL. Image downloads are limited to AliExpress, `alicdn.com` and `aliexpress-media.com` hosts; unrecognized hosts are reported rather than silently trusted.

## Queue controls

- **Pause / Resume:** cooperative pause at product/scroll/download boundaries. An in-flight network request finishes first; a ZIP already being written is allowed to complete safely.
- **Duplicate skipping:** compares product IDs against active jobs and existing successful archive paths. If a ZIP was deleted, that link can be added again. Turn off the setting to deliberately capture another snapshot.
- **Retry failed links:** requeues failed product jobs and runs them again. A completed archive with image warnings is still completed; recapture that product with duplicate skipping disabled to retry its images.
- **Recovery:** queue, settings and download records persist. Jobs interrupted by app closure become pending at next startup. Click Run to continue. Login/CAPTCHA waits require you to press Continue.
- **Clear finished:** removes completed/failed queue rows. It does not delete archives or Downloads history.

## Develop from source

Use Node.js 24 LTS and npm. In PowerShell, from this repository:

```powershell
npm ci
npm start
```

The Windows release includes Chromium. Source-only development falls back to a per-user Chromium download when no bundle is available. For the standalone automated test suite, separately install the test browser and run:

```powershell
npm run browser:install
npm test
```

On this Linux cloud machine, tests use `/usr/bin/chromium`; set `TEST_CHROMIUM` to another trusted Chromium executable if needed. The GUI requires a display. No accounts or credentials are required for the deterministic fixture tests.

### Build a Windows release

```powershell
npm ci
npm run build:win
```

The build first downloads pinned Windows Chromium with `npm run bundle:chromium`, then creates `dist/AliExpress-Product-Archiver-1.1.0-win-x64.zip`, containing the EXE, Chromium and supporting resources. Browser binaries are excluded from Git and copied into the release as resources. `scripts/verify-package.js` checks the packaged source and Chromium SHA-256 against the download manifest. No Windows installer or signing certificate is needed to build this portable folder distribution. Sign a commercial release with your own certificate through Electron Builder before distributing broadly. A CI workflow builds and uploads the Windows bundle on manual dispatch or a version tag.

To additionally package the single-file portable EXE from that built folder:

```powershell
npm exec -- electron-builder --win portable --x64 --prepackaged dist/win-unpacked
```

For faster local packaging, Electron Builder supports `ELECTRON_BUILDER_COMPRESSION_LEVEL=5`; this changes compression only.

### UI integration test

`test/ui.e2e.js` launches the real Electron UI, real Chromium extraction, queue and ZIP workflow. Only external product content/image transport and the native folder-picker result are fixtures. It does not use a live account. Provide an X display on Linux. On Windows, install the test browser with `npm run browser:install` and run `node test/ui.e2e.js`. You can override `TEST_ELECTRON` and `TEST_CHROMIUM` with trusted executable paths:

```sh
DISPLAY=:99 node test/ui.e2e.js
```

With Xorg and its dummy driver installed, `bash scripts/test-ui-linux.sh` also creates and cleans up an isolated test display automatically.

See `VALIDATION.md` for the exact checks and live-validation limitations of this delivery.

## Local storage and troubleshooting

The app uses Electron's per-user data directory (normally under `%APPDATA%`) for `state.json` and `chromium-profile/`. Bundled Chromium lives alongside the app resources; `browsers/` is used only by the source-development fallback downloader. Cookies and login sessions remain local. Never share this directory or include it in source archives. No password/token is requested by the desktop UI.

- Source-development browser download failed: check Internet access to `cdn.playwright.dev`, Microsoft download mirrors and Chrome-for-Testing storage; retry Open Chromium. Keep TLS verification enabled.
- Verification repeats: use the actual product page in Chromium, complete the challenge, then Continue. The app does not bypass CAPTCHA.
- Page loads but data is incomplete: increase settling time, check country/currency, expand/load the description in Chromium and Continue if prompted. Review `product.json` warnings. Site changes may require an extractor update.
- Browser closed mid-run: the product is marked failed. Reopen Chromium and retry failed links.
- Output folder unavailable: choose a writable local folder. ZIP creation failures are reported per product; partial temporary files are cleaned on ordinary errors. App crashes may leave `.archive-*` directories or `.zip.partial` files that can be removed when no run is active.

Use the tool for pages you are authorized to access and observe the site's access limits. Extraction is sequential, with a configurable delay; there is no stealth or CAPTCHA bypass mechanism.

## Compact bundled release

Version 1.1 uses maximum compression and ships English interface language packs only for Electron and Chromium, including Chromium’s English grammatical variants. Product descriptions, Unicode exports, prices, images, SKU options, and login persistence are unchanged. The complete original Chromium download stays intact in the build cache; only the separate release copy is trimmed. Chromium remains included, so no separate browser download is required. The EXE decompresses into a larger runtime folder while running; smaller download size does not mean a small installed Chromium.
