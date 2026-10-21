# Validation report — visible variation prices, CSV and JPEG export

## Version 1.2.1 checks

The export contract for this version is one product ZIP containing only `product.csv` and `Images/*.jpg`. CSV columns are exactly `Title`, `Description`, `Variation`, `Price`. The observed AliExpress AI overview is preferred, with seller description as the fallback. Price must come from the visible current-price field after the corresponding variation is selected and confirmed. Missing data stays blank.

Validation for this revision must confirm:

- Extraction preserves observed titles, descriptions, variation names and currencies. The visible selected-variation price wins when hidden SKU/catalog amounts differ.
- A fixture with `20*20cm` showing `$8.15` and a different price for `15X15cm` exports each selection's own observed price. Loading, delayed changes, selected-state confirmation and stable-price waiting are exercised.
- Unselectable, unavailable or unconfirmed variations keep blank prices; hidden catalog amounts and unrelated or crossed-out prices are not fallback values.
- A single DOM-only option group can produce measured rows, while multiple groups without known SKU combinations do not create a Cartesian product.
- Exports from version 1.2.0 remain visible and can be recaptured under the new visible-price mode with duplicate skipping enabled.
- An expanded, substantive AI overview takes priority; hidden or unrelated content does not replace the seller fallback.
- ZIP contents match the four-column CSV and single JPEG image folder contract.
- WebP/PNG sources become decodable JPEG files with correct dimensions and image content, including a WebP payload served behind a `.jpg` URL.
- Pause/resume, manual verification, retry, duplicate skipping, legacy-export recapture, persisted history and image warnings still work.
- A ten-product desktop batch exposes each finished ZIP while remaining links continue in the same Chromium session.
- The Windows package includes matching Chromium, packaged runtime files match source, and the actual Windows EXE opens its bundled browser.

Results for the current revision are recorded below only after the corresponding commands and GitHub run finish. The checklist alone is not evidence of a passed test.

## Recorded results

Local version 1.2.1 checks passed on 2026-10-21:

- `npm test`: 34 tests passed, zero failures or skips. The price suite uses a selected `20*20cm` with visible `$8.15`, another size with `$6.40`, and deliberately conflicting hidden catalog amounts. CSV rows preserve the confirmed visible prices and ignore those catalog amounts.
- `node --test test/prices.test.js`: all 14 price tests passed, including serialized multi-option price updates. They cover hidden/shipping/coupon/crossed-out prices, delayed price updates, loading states, silent stale prices, same-price rerenders, ambiguous SKU mapping, missing prices and DOM-only option groups. A selected option alone is insufficient evidence that the previous price has refreshed. Two-group regressions change both Color and Size, with an intermediate $7.00 update and a delayed final $6.40 update (including a 1-second settling / 1.6-second final update case); the final SKU receives $6.40 rather than the intermediate price. Unconfirmed updates stop further price selection to avoid misattributing late responses.
- `bash scripts/test-ui-linux.sh`: passed. The real desktop workflow exported 11 products, including the ten-link streaming batch. Every ZIP contained only the four-column CSV and three decodable JPEGs; the CSV used the visible `$8.15` rather than the hidden `$99.00` fixture amount. Login/CAPTCHA, pause/resume, navigation failure/retry, duplicate skipping, persistence and expanded AI overview were retained.

Native Windows tests and public version 1.2.1 publication are pending. The workflow will exercise the actual packaged visible-price code before publishing. Results below belong to the preceding version.

### Previous version 1.2.0

Local version 1.2.0 checks passed on 2026-10-21:

- `npm test`: 19 tests passed, zero failures or skips. This includes actual PNG/WebP conversion, misleading image MIME, decoded JPEG dimensions and white transparency, AI overview expansion/priority/fallback, missing and numeric-zero prices, four-column CSV output and legacy duplicate migration.
- `bash scripts/test-ui-linux.sh`: passed with the real Electron UI and production Chromium/queue/archive path. Manual verification, pause/resume, failed navigation and retry, duplicate skipping, persistence and ten-product streaming delivery passed. All 11 exported ZIPs contained only the CSV and three decodable JPEG images; expanded overview text remained preferred over seller text.
- JavaScript syntax and `git diff --check` passed.

Native Windows checks passed in [run 39558244132](https://github.com/Awser42/Software/actions/runs/39558244132), source commit `b144fccf02a423d01f5077559d25f32808950bb9`:

- Windows unit/archive tests passed.
- Packaged runtime files matched source, and the bundled Chromium bytes matched the build manifest SHA-256.
- The real desktop workflow using shipped Chromium passed the ten-product batch and CSV/JPEG-only archive assertions.
- The actual packaged Windows EXE launched its included Chromium and used the packaged JPEG/archive modules to convert deliberately mislabeled WebP into a decodable 20×12 JPEG. The resulting ZIP contained only the exact four-column CSV and one readable variation-image filename, preserving the observed USD 8.15 fixture price.

Portable compression, artifact upload and public release publication also passed in that same run. The `v1.2.0` release tag resolves to the tested source commit above.

Public downloads were independently checked without GitHub login on 2026-10-21:

- [Windows EXE](https://github.com/Awser42/Software/releases/download/v1.2.0/AliExpress-Product-Archiver-1.2.0-win-x64.exe): HTTP 200, 203,926,282 bytes; a 16-byte HTTP 206 range response begins with the executable `MZ` signature.
- [Download ZIP](https://github.com/Awser42/Software/releases/download/v1.2.0/AliExpress-Product-Archiver-1.2.0-Download.zip): HTTP 200, 203,927,330 bytes; its HTTP 206 range response begins with `PK` ZIP bytes.
- [Public SHA-256 manifest](https://github.com/Awser42/Software/releases/download/v1.2.0/SHA256SUMS.txt): HTTP 200. The EXE hash is `e5ef4c5352941861fbb487943ca671b3f8c4ac039886cf691d601d7ef7a6142d`; the ZIP hash is `b706c7eb356db488c07f8cc0ddef46bfed21352056b79619195e067b9fda58f8`.

The range probes verify public delivery and file signatures; they do not constitute an independent full-file hash calculation. The publisher created these assets from the tested workflow artifact and generated the manifest before uploading them.

The earlier version 1.1.0 Windows workflow passed at [run 39548331257](https://github.com/Awser42/Software/actions/runs/39548331257), source commit `795422b373ef5c4fff263f8d618ce5bc1d769f1d`. That run covered the prior export format and does not validate the new CSV/JPEG changes.

## Live-account limits

The supplied product URL `https://www.aliexpress.us/item/3256810248416998.html` was attempted from this cloud machine on 2026-10-21; the HTTPS proxy rejected the connection with HTTP 403 before an AliExpress page loaded. No live product fields or logged-in account prices were validated from that request.

Controlled fixtures verify extraction and export behavior. They do not establish a live account-specific AliExpress price or guarantee compatibility with every live product. No real account login or CAPTCHA completion is claimed by fixture tests. Login takes place manually in the visible Chromium window.

Price, currency, region, coupons, taxes and shipping can affect the final checkout amount. Missing values are never estimated. Native Windows behavior must be supported by an actual Windows run; a Linux test alone does not establish it.

## Windows user check

Run the portable EXE, click Open Chromium / Login, and sign in. Set your country/currency, paste 8–10 full product links and Run. Each completed product should appear in Latest saved product and Downloads while later links continue.

Inspect each ZIP: it should contain only `product.csv` and the `Images/` folder. Open the CSV and compare Title, Description and Variation with the logged-in page. Select each exported variation in Chromium and compare its visible current price with that row's Price. Confirm that missing or unconfirmed prices remain blank instead of receiving a hidden SKU amount. Increase Page / variation settling time if the page updates slowly. Where available, Description should contain the observed AI overview and its disclaimer; otherwise it should contain the lower seller description. Confirm the images open as JPEGs and variation filenames are readable. Review warnings in the app for unavailable fields or images.
