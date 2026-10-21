# AliExpress Product Archiver

Windows desktop app built with Electron and Playwright Chromium. Paste 15, 20, 30 or more AliExpress links and save each product as soon as it finishes. A visible Chromium window keeps your login session and lets you complete CAPTCHA yourself.

## Run on Windows

Download version 1.3.0 from [GitHub Releases](https://github.com/Awser42/Software/releases/latest). Requires Windows 10/11 x64. Node.js and a separate Chromium installation are not needed.

- Run `AliExpress-Product-Archiver-1.3.0-win-x64.exe` directly. This portable launcher includes Chromium and extracts its runtime resources temporarily.
- If you download `AliExpress-Product-Archiver-1.3.0-Download.zip`, extract it first, then run the portable EXE inside.
- A developer-built `AliExpress-Product-Archiver-1.3.0-win-x64.zip` is a folder distribution. Extract its entire contents and keep `AliExpress Product Archiver.exe` beside its supporting files.

The release is unsigned. The app saves settings and your Chromium profile under your Windows user account.

1. Click **Open Chromium / Login** and log into AliExpress in that window.
2. Choose your delivery country and currency in AliExpress. The app reads the visible current price for each variation it can select and confirm in that session.
3. Choose an output folder, paste full product URLs into the numbered link cells (newlines or Excel columns paste into consecutive rows), and click **Run all links**.
4. If verification appears, complete it in Chromium, then click **Continue after login / CAPTCHA** in Progress. If you paused, also click Resume.
5. Open each finished ZIP from Latest saved product or Downloads while the remaining links continue.

**Urdu:** Chromium mein apna AliExpress account login karein, folder choose karein, phir links paste karke Run karein. Har product ki ZIP alag save hoti rahegi. CSV mein title, description, variation aur us variation ko select karne par nazar aane wali price hogi; sizes, colors, features/specifications aur seller description bhi available hon to CSV mein hongi; images alag `Images/` folder mein JPEG hongi. Jo data available nahi hoga woh banaya nahi jayega.

## Export contents

Every ZIP contains only these outputs:

| File/folder | Contents |
| --- | --- |
| `product.csv` | `Title`, `Description`, `Seller Description`, `Variation`, `Price`, `Size`, `Color`, `Features`, `Specifications`, `Images` |
| `Images/` | Available main, variation and description images, saved as real `.jpg` JPEG files |

The ZIP filename uses the product title and product ID. Existing files are never overwritten. The UTF-8 CSV includes a BOM for Excel, quotes multiline descriptions and escapes spreadsheet formulas. Title, preferred description, seller description, observed features and specifications repeat across variation rows so each row can be read independently. Variation names come from the observed product data. For each known variation that can be selected and confirmed, Price is read from the visible current-price field after the page settles. Missing or unconfirmed prices stay blank. A generic displayed price is not assigned to other variations, and unseen option combinations are not invented. Price text retains the displayed currency.

For Description, the app first uses the visible AliExpress **AI overview of item**, including its observed disclaimer and bullet text. This is content displayed by AliExpress; the app does not generate a summary. If no substantive overview is available, it uses the seller description lower on the page. If neither is exposed, Description stays blank. The independent Seller Description column retains the full exposed seller text even when the AI overview is preferred. Description images from the seller HTML endpoint and description frames are still downloaded. Features and Specifications contain only observed text, never inferred facts from product photos.

Available image URLs use the original/CDN size where exposed. Recognized thumbnail suffixes are removed. WebP, PNG and other supported source formats are decoded and converted to JPEG; changing a filename alone is not conversion. JPEG conversion keeps the available image dimensions, with a white background for transparency. Variation filenames include readable observed option names. Duplicate image URLs are downloaded once. An original that AliExpress does not expose cannot be recovered. Failed downloads or conversions appear as warnings in the app while the remaining output is saved.

JSON, HTML, extra CSVs and text reports are not included in the product ZIP. Older CSV/JPEG downloads keep their **CSV + JPEG** label; older output formats appear as **Earlier archive**. Links captured before version 1.3.0 can be added again with duplicate skipping enabled to capture visible variation prices. Existing ZIPs remain available. Size and Color identify the options for that row; Images contains matching variation-image paths followed by available main/description JPEG paths. Downloads includes an expandable preview of descriptions and variation prices.

## Prices and completeness

Price comes from the **visible current price for the selected variation** in your logged-in Chromium window. The app selects each known variation, confirms that the options are selected, waits for loading and the price to settle, then reads that field. Hidden SKU/catalog amounts, crossed-out original prices and generic product prices are not substituted when a variation price cannot be confirmed; its Price cell stays blank and the app reports a warning.

For example, if selecting `20*20cm` shows `$8.15`, that variation's row uses `$8.15`. Selecting `15X15cm` must supply its own visible price; `$8.15` is not copied to it. This example explains the capture rule and is not a claim that a live account was tested.

Known SKU combinations are visited as exposed. A page with only one observed option group can be measured option by option. Without SKU records, the app can explore actual enabled UI selections one change at a time and exports only full combinations whose visible price is confirmed, up to 200 observed rows. Disabled choices are skipped; uncertain updates stop further price discovery. Incomplete starting selections with multiple required groups may remain unconfirmed, with a warning. No combinations or prices are generated from a Cartesian product. The **Page / variation settling time** setting applies after each selection as well as the initial page load, so products with many variations take longer. Increase it if AliExpress updates prices slowly.

These observations are not a guaranteed checkout total. Shipping, taxes, coupons, new-user discounts, delivery destination, currency and the selected variation can affect the amount. The app does not perform checkout, convert currency or estimate a missing cost.

AliExpress may change its markup, restrict a product or region, or require verification. The extractor reads known product modules, JSON-LD, relevant observed responses and product DOM fields. Missing fields stay empty; a page without credible product content fails rather than creating invented data. Review warnings in Downloads for unavailable fields or images.

Use full `/item/NUMBER.html` or `/i/NUMBER.html` links on `aliexpress.com`, `aliexpress.us` or their subdomains. Tracking parameters are removed. Resolve short affiliate links to the full product URL first. Image downloads are limited to AliExpress, `alicdn.com` and `aliexpress-media.com` hosts.

## Queue controls

- **Pause / Resume:** pauses at product, variation, scroll and download boundaries. An in-flight request or ZIP write can finish first.
- **Duplicate skipping:** compares product IDs against active jobs and existing successful exports made with visible variation prices. Deleted ZIPs, version 1.2.0 CSV/JPEG exports and earlier formats can be captured again. Disable the setting to save another snapshot.
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

`test/ui.e2e.js` exercises the real Electron UI, production Chromium launcher, queue and archive pipeline. External product content, image transport and the native folder-picker result use controlled fixtures. It tests a 30-product batch and checks that the first ZIP is available while later products continue.

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
- **Description or price is missing:** check delivery country/currency and page content, increase Page / variation settling time, and retry. The app leaves Price blank when it cannot select and confirm a variation or observe a stable current price. Expand the description in Chromium if needed. Read the warnings in Downloads.
- **Browser closes during a run:** reopen Chromium and retry failed links.
- **Output folder fails:** choose a writable local folder. Temporary files are cleaned after ordinary errors. A crash may leave `.archive-*` or `.zip.partial` files; remove these only while no run is active.

Extraction is sequential, with a configurable delay. Login and CAPTCHA completion are manual.

## Link cells and complete exports

Bulk Links starts with 30 numbered cells. Choose 15/20/30 rows, add more rows, or paste a newline/TSV list from Excel into any cell; remaining links fill subsequent rows. Enter moves down, Shift+Enter moves up. Each row shows validation and queue status. Run all links processes the queue automatically and publishes each ZIP as it finishes. The secondary Paste many links box also accepts one link per line.

Version 1.3.0 exports can recapture older links with duplicate skipping enabled because older CSV formats do not include all the new fields. Images are downloaded from exposed image URLs; the app does not perform OCR or invent descriptions/specifications from a photograph. Login and CAPTCHA completion remain manual in Chromium. `Live-product-check.json` in the release records the separate anonymous live-page check; it is distinct from the controlled 30-product desktop tests and does not establish your account-specific price.

The separate **Live product verification without an account** GitHub workflow can check another product URL without rebuilding or replacing a release. It runs the production extractor on Windows with matching compact Chromium and records its actual anonymous result under `validation/live-products/` on the selected branch, with a screenshot in the Actions evidence artifact. A login/verification result does not validate that product's fields or prices. The later corrected embroidery URL is `https://www.aliexpress.us/item/3256811699433017.html`; the original v1.3.0 release audit used the earlier supplied product URL.
