# Validation report — bulk queue and bundled Chromium

## Passed in this cloud machine

- `npm test`: **10 passed, 0 failed, 0 skipped**. Includes Chromium bundle resolution/version checks, path protection, extraction, exact fixture prices, original image URLs, options, specifications, HTML safety, complete ZIP contents, asset errors, CSV safety, URL validation, duplicates, pause/resume, manual verification and retry.
- `bash scripts/test-ui-linux.sh`: real Electron desktop UI and production Chromium launcher/extraction/ZIP path with controlled external product fixtures. Tested settings, folder picker IPC, login/CAPTCHA continuation, pause/resume, failed navigation and retry, previews, history, and a **10-product batch**. Confirmed the first new ZIP exists and is exposed in the UI while later products are still pending; all ten separate ZIPs eventually complete in the same browser session.
- Downloaded matching **Windows Chromium 156.0.8078.4 (revision 1248)** through Playwright's official HTTPS download flow. No TLS or verification bypass was used.
- `node scripts/verify-package.js`: Windows package runtime files match current source, bundled Windows Chromium exists, and its SHA-256 matches the download manifest.
- Windows x64 ZIP and portable EXE build include Chromium as application resources. Release builds are unsigned.

Screenshots from the desktop test are in `test-results/`, including `bulk-in-progress.png` showing delivery during an active batch. These are fixture products, not captured live AliExpress products.

## GitHub practical test

The Windows Actions workflow runs on pushes to `main`, pull requests, and manual dispatch. It runs unit/archive tests; builds the Windows app with Chromium; verifies packaged files; exercises the ten-product desktop fixture with the **shipped Windows Chromium**; then launches the **actual packaged Windows EXE** and verifies that its bundled browser opens without installation. Screenshots and releases are uploaded as Actions artifacts.

GitHub execution status is reported separately in the delivery message. A workflow file or successful local run does not establish a successful GitHub run.

## Remaining limits

This machine is Linux, so native Windows execution is delegated to the GitHub Windows workflow and must be confirmed from its actual run result. Local tests do not establish native Windows success.

No AliExpress account was logged in here. Login and CAPTCHA completion remain manual in the visible Chromium window. Fixture prices verify extraction behavior, not a live account-specific cost. Product price, currency, region, coupons, taxes and shipping may affect the final amount; missing fields are never estimated.

## Windows user check

Run the single-file EXE, or extract the entire ZIP and run its app EXE. Click Open Chromium / Login; the included browser should open without a separate download. Sign in, set currency/delivery region, paste 8–10 real product links and Run. Each completed product appears immediately in Latest saved product and Downloads while remaining links continue. Inspect prices, image folders, description HTML, CSV files, complete JSON, and warnings in the saved ZIPs.

## Compact 1.1 release

The preceding full Windows workflow passed at https://github.com/Awser42/Software/actions/runs/39547465770 (commit ee121fe), including the ten-product streaming batch, native packaged EXE and included Chromium. Version 1.1 keeps Chromium bundled, enables maximum compression, ships English browser/desktop interface packs, and preserves the original Chromium download intact. A fresh Windows workflow validates the compact release; its actual result is linked in the delivery report.
