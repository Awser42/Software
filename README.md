# AliExpress Product Archiver

Windows desktop app built with Electron and Playwright Chromium. Paste 8, 10, or more AliExpress links and save each product as soon as it finishes. A visible Chromium window keeps your login session and lets you complete CAPTCHA yourself.

## Run on Windows

Download version 1.2.0 from [GitHub Releases](https://github.com/Awser42/Software/releases/latest). Requires Windows 10/11 x64. Node.js and a separate Chromium installation are not needed.

- Run `AliExpress-Product-Archiver-1.2.0-win-x64.exe` directly. This portable launcher includes Chromium and extracts its runtime resources temporarily.
- If you download `AliExpress-Product-Archiver-1.2.0-Download.zip`, extract it first, then run the portable EXE inside.
- A developer-built `AliExpress-Product-Archiver-1.2.0-win-x64.zip` is a folder distribution. Extract its entire contents and keep `AliExpress Product Archiver.exe` beside its supporting files.

The release is unsigned. The app saves settings and your Chromium profile under your Windows user account.

1. Click **Open Chromium / Login** and log into AliExpress in that window.
2. Choose your delivery country and currency in AliExpress. The app observes the prices exposed to that session.
3. Choose an output folder, paste one full product URL per line, and click **Run extraction**.
4. If verification appears, complete it in Chromium, then click **Continue after login / CAPTCHA** in Progress. If you paused, also click Resume.
5. Open each finished ZIP from Latest saved product or Downloads while the remaining links continue.

**Urdu:** Chromium mein apna AliExpress account login karein, folder choose karein, phir links paste karke Run karein. Har product ki ZIP alag save hoti rahegi. CSV mein title, description, variation aur available price hogi; images alag `Images/` folder mein JPEG hongi. Jo data available nahi hoga woh banaya nahi jayega.

## Export contents

Every ZIP contains only these outputs:

| File/folder | Contents |
| --- | --- |
| `product.csv` | Exactly four columns: `Title`, `Description`, `Variation`, `Price` |
| `Images/` | Available main, variation and description images, saved as real `.jpg` JPEG files |

The ZIP filename uses the product title and product ID. Existing files are never overwritten. The UTF-8 CSV includes a BOM for Excel, quotes multiline descriptions and escapes spreadsheet formulas. Title and description repeat across variation rows so each row can be read independently. Variation names and their prices come from the observed product data; missing prices stay blank. A generic displayed price is not assigned to unpriced variations, and unseen option combinations are not invented. Price text retains the exposed currency.

For Description, the app first uses the visible AliExpress **AI overview of item**, including its observed disclaimer and bullet text. This is content displayed by AliExpress; the app does not generate a summary. If no substantive overview is available, it uses the seller description lower on the page. If neither is exposed, Description stays blank.

Available image URLs use the original/CDN size where exposed. Recognized thumbnail suffixes are removed. WebP, PNG and other supported source formats are decoded and converted to JPEG; changing a filename alone is not conversion. JPEG conversion keeps the available image dimensions, with a white background for transparency. Variation filenames include readable observed option names. Duplicate image URLs are downloaded once. An original that AliExpress does not expose cannot be recovered. Failed downloads or conversions appear as warnings in the app while the remaining output is saved.

JSON, HTML, specifications, extra CSVs and text reports are not included in the product ZIP. Earlier-version downloads remain visible as **Earlier archive** and are not relabelled as JPEG exports. Links saved by earlier versions can be added again to create the new format.

## Prices and completeness

Prices are observations from your Chromium session, including exposed SKU prices and visible price text. They are not a guaranteed checkout total. Shipping, taxes, coupons, new-user discounts, delivery destination, currency and the selected variation can affect the amount. The app does not perform checkout, convert currency or estimate a missing cost.

AliExpress may change its markup, restrict a product or region, or require verification. The extractor reads known product modules, JSON-LD, relevant observed responses and product DOM fields. Missing fields stay empty; a page without credible product content fails rather than creating invented data. Review warnings in Downloads for unavailable fields or images.

Use full `/item/NUMBER.html` or `/i/NUMBER.html` links on `aliexpress.com`, `aliexpress.us` or their subdomains. Tracking parameters are removed. Resolve short affiliate links to the full product URL first. Image downloads are limited to AliExpress, `alicdn.com` and `aliexpress-media.com` hosts.

## Queue controls

- **Pause / Resume:** pauses at product, scroll and download boundaries. An in-flight request or ZIP write can finish first.
- **Duplicate skipping:** compares product IDs against active jobs and existing successful CSV/JPEG exports. Deleted ZIPs and earlier export formats can be captured again. Disable the setting to save another snapshot.
- **Retry failed links:** requeues failed products. A completed ZIP with image warnings counts as completed; recapture it with duplicate skipping disabled to retry those images.
- **Recovery:** settings, queue and download history persist. Interrupted jobs become pending at startup; click Run to continue. Login/CAPTCHA waits require Continue.
- **Clear finished:** removes finished queue rows without deleting ZIPs or download history.

## Develop from source

Use Node.js 24 LTS and npm. In PowerShell from this repository:

```powershell
npm ci
npm start
```

The Windows release bundles Chromium. Source development downloads a matching per-user browser on first launch when no bundle is available. For the automated test browser:

```powershell
npm run browser:install
npm test
```

On this Linux cloud machine, tests use `/usr/bin/chromium` when present. Set `TEST_CHROMIUM` to another trusted executable if needed. GUI tests need a display. The deterministic fixtures do not require an account.

### Build Windows packages

```powershell
npm ci
npm run build:win
node scripts/verify-package.js
npm exec -- electron-builder --win portable --x64 --prepackaged dist/win-unpacked
```

`build:win` downloads the pinned Windows Chromium through Playwright and creates the folder ZIP under `dist/`. The final command also creates the portable EXE. `scripts/verify-package.js` compares packaged runtime source and the bundled Chromium SHA-256 with the build inputs. Browser binaries are generated resources and are excluded from Git. A signing certificate is not required to build these unsigned packages.

The bundled release uses maximum compression and English interface language packs for Electron and Chromium. Chromium's English grammatical variants are retained. The original browser download remains intact in the build cache; the release uses a separate compact copy. Chromium still needs a larger runtime folder while running.

### Desktop integration tests

`test/ui.e2e.js` exercises the real Electron UI, production Chromium launcher, queue and archive pipeline. External product content, image transport and the native folder-picker result use controlled fixtures. It tests a ten-product batch and checks that the first ZIP is available while later products continue.

On Windows, install the test browser and run:

```powershell
node test/ui.e2e.js
```

On Linux with Xorg and its dummy driver installed:

```sh
bash scripts/test-ui-linux.sh
```

With an existing display, use `DISPLAY=:99 node test/ui.e2e.js`. `TEST_ELECTRON` and `TEST_CHROMIUM` can select trusted executable paths. The GitHub Windows workflow also tests the shipped Chromium and launches the packaged Windows EXE. See [VALIDATION.md](VALIDATION.md) for recorded results and live-account limits.

## Local storage and troubleshooting

The app uses Electron's per-user data directory, normally under `%APPDATA%`, for `state.json` and `chromium-profile/`. Login cookies remain local. Bundled Chromium lives with the app resources; `browsers/` is the source-development fallback. Do not share your profile directory. The app does not ask for a password or token in its desktop UI.

- **Browser download fails during source development:** check access to Playwright's official download hosts and retry Open Chromium. Keep TLS verification enabled.
- **Verification repeats:** finish the challenge on the requested product page in Chromium, then Continue.
- **Description or price is missing:** check delivery country/currency and page content, increase settling time, and retry. Expand the description in Chromium if needed. Read the warnings in Downloads.
- **Browser closes during a run:** reopen Chromium and retry failed links.
- **Output folder fails:** choose a writable local folder. Temporary files are cleaned after ordinary errors. A crash may leave `.archive-*` or `.zip.partial` files; remove these only while no run is active.

Extraction is sequential, with a configurable delay. Login and CAPTCHA completion are manual.
