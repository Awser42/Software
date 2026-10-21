# Validation report — CSV and JPEG export

## Version 1.2.0 checks

The export contract for this version is one product ZIP containing only `product.csv` and `Images/*.jpg`. CSV columns are exactly `Title`, `Description`, `Variation`, `Price`. The observed AliExpress AI overview is preferred, with seller description as the fallback. Missing data stays blank.

Validation for this revision must confirm:

- Extraction preserves observed titles, descriptions, variation names, currencies and prices without filling missing SKU prices or inventing combinations.
- An expanded, substantive AI overview takes priority; hidden or unrelated content does not replace the seller fallback.
- ZIP contents match the four-column CSV and single JPEG image folder contract.
- WebP/PNG sources become decodable JPEG files with correct dimensions and image content, including a WebP payload served behind a `.jpg` URL.
- Pause/resume, manual verification, retry, duplicate skipping, legacy-export recapture, persisted history and image warnings still work.
- A ten-product desktop batch exposes each finished ZIP while remaining links continue in the same Chromium session.
- The Windows package includes matching Chromium, packaged runtime files match source, and the actual Windows EXE opens its bundled browser.

Results for the current revision are recorded below only after the corresponding commands and GitHub run finish. The checklist alone is not evidence of a passed test.

## Recorded results

Local version 1.2.0 checks passed on 2026-10-21:

- `npm test`: 19 tests passed, zero failures or skips. This includes actual PNG/WebP conversion, misleading image MIME, decoded JPEG dimensions and white transparency, AI overview expansion/priority/fallback, missing and numeric-zero prices, four-column CSV output and legacy duplicate migration.
- `bash scripts/test-ui-linux.sh`: passed with the real Electron UI and production Chromium/queue/archive path. Manual verification, pause/resume, failed navigation and retry, duplicate skipping, persistence and ten-product streaming delivery passed. All 11 exported ZIPs contained only the CSV and three decodable JPEG images; expanded overview text remained preferred over seller text.
- JavaScript syntax and `git diff --check` passed.

The native Windows packaged-EXE test and public version 1.2.0 release are pending. The workflow tests the actual packaged code and bundled Chromium, including a CSV/JPEG export from mislabeled WebP bytes, before publication. No native Windows success is claimed until that run completes.

The earlier version 1.1.0 Windows workflow passed at [run 39548331257](https://github.com/Awser42/Software/actions/runs/39548331257), source commit `795422b373ef5c4fff263f8d618ce5bc1d769f1d`. That run covered the prior export format and does not validate the new CSV/JPEG changes.

## Live-account limits

Controlled fixtures verify extraction and export behavior. They do not establish a live account-specific AliExpress price or guarantee compatibility with every live product. No real account login or CAPTCHA completion is claimed by fixture tests. Login takes place manually in the visible Chromium window.

Price, currency, region, coupons, taxes and shipping can affect the final checkout amount. Missing values are never estimated. Native Windows behavior must be supported by an actual Windows run; a Linux test alone does not establish it.

## Windows user check

Run the portable EXE, click Open Chromium / Login, and sign in. Set your country/currency, paste 8–10 full product links and Run. Each completed product should appear in Latest saved product and Downloads while later links continue.

Inspect each ZIP: it should contain only `product.csv` and the `Images/` folder. Open the CSV and compare Title, Description, Variation and Price with the logged-in page. Where available, Description should contain the observed AI overview and its disclaimer; otherwise it should contain the lower seller description. Confirm the images open as JPEGs and variation filenames are readable. Review warnings in the app for unavailable fields or images.
