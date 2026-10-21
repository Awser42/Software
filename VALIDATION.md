# Validation report — filtered images, readable exports and small updates

## Version 1.4.1 — Excel only, refreshed UI and Windows uninstall

New product ZIPs contain only `product.xlsx` and `Images/*.jpg`; CSV generation was removed. Product Details retains observed title, URL, capture time, descriptions, features and specifications. Variations puts each observed variation name immediately beside its confirmed price, size and color, with title and matching image filenames. Long descriptions continue over labeled rows bounded by both text length and line count, preserving Unicode and complete text. Export format `product-xlsx-jpeg-v4` lets older-format links be captured again without deleting earlier ZIPs.

The desktop interface now uses a light layout with workflow steps, distinct queue totals, clearer link cells and organized progress, Downloads and Settings. Background browser/tray controls remain. The Windows distribution is now an assisted per-user NSIS Setup installer with Start menu/desktop shortcuts and actual uninstall registration. Settings includes a fixed Windows app-management action. Separate product exports and the saved profile are preserved on uninstall. Existing portable EXEs are separate files; compatible code updates change their features but do not register them as installed apps.

Local checks passed on 2026-10-21:

- `npm test`: 61 passed, zero failures/skips, including Excel-only ZIP contents, exact individually observed prices, blank/stale prices, complete long descriptions, literal formula-like strings and recapture from version 1.4.0.
- `bash scripts/test-ui-linux.sh`: real desktop 15/20/30-cell paste and 30-product streaming workflow passed. Its initial product plus batch generated 31 Excel-only ZIPs and 186 decoded JPEGs. Every workbook's observed title, expanded overview, independent seller content, variation names/prices, sizes, colors, features, specifications and image references matched the fixtures. No CSV was present. Manual login gate, folder/settings, pause/resume, retry, duplicates, previews and persistence passed.
- An independent openpyxl read of an actual `makeArchive` output confirmed only product.xlsx, exact full long Unicode description/end marker, separate size prices $8.15/$6.40, source details, literal cells, widths/frozen headers and variation filtering. These are controlled fixture amounts, not live account prices.
- The exact released 1.4.0 source/package and unchanged update loader were launched under real Electron with isolated user data, then upgraded using the current 1.4.1 code ZIP (65,083 bytes) through controlled transport. The older baseline reopened the new Excel-only UI, preserved timing/settings and marked startup healthy. This verifies the compatible source-loader update path; it is not a new Windows portable-binary run or live GitHub transport test.
- Workflow YAML, JavaScript syntax and `git diff --check` passed. The code update excludes Chromium/Electron.

Native Windows results and publication:

- Candidate [run 39587919778](https://github.com/Awser42/Software/actions/runs/39587919778), source `5311f733df0069ee9aa05934446b287d9f070a4d`, freshly passed all 61 unit tests, source/browser byte verification, the complete 30-product desktop batch and packaged EXE Excel/JPEG/visible-price and synthetic future-update acceptance. The actual Setup EXE was built and uploaded, but electron-builder then attempted implicit CI publishing without a publishing token, causing the build step to report failure. The gated release was blocked; no release came from that candidate.
- Before running installer acceptance again, its registry check was corrected for electron-builder's actual defaults: the display name includes the version, and the registered uninstall command identifies its installation path. The Windows template stores InstallLocation in a separate install key rather than guaranteeing it in the uninstall entry. Production app code and runtime/browser inputs were unchanged by these test corrections.
- Final [run 39589172239](https://github.com/Awser42/Software/actions/runs/39589172239), tested/tagged commit `1e5c5a55251471d2ef2d0de75f7fad7d1b851dbc`, passed fresh 61-test unit validation and actual installer acceptance. Its authenticated guard verified unchanged application/dependency/browser/desktop-fixture inputs and completed Windows batch/package steps against the earlier source, then retrieved that source-matched Setup artifact and evidence. The full batch was not repeated in the final retry.
- The actual Setup silently installed per user into an isolated folder and registered its version and uninstall command in HKCU. All installed source files were independently compared with the current checkout; bundled Chromium executable bytes/version/locales were verified. The installed EXE then passed real visible-price, Excel-only/JPEG export and a controlled synthetic 1.4.2 code-update restart with settings retained and healthy startup. Its Settings action reached the fixed Windows app-management URI through controlled shell transport. The actual uninstaller removed application files and registration while preserving separate user-export files.
- All final evidence/installer/code-update uploads and the gated publisher passed. Rebuild commands now explicitly disable electron-builder's implicit publishing; only the tested-release publisher performs publication. The `v1.4.1` tag resolves exactly to the final tested commit above. Small updates are source-code packages, not a conversion of portable copies into Windows installed apps.

Independent anonymous public checks passed on 2026-10-21:

- [Setup EXE](https://github.com/Awser42/Software/releases/download/v1.4.1/AliExpress-Product-Archiver-1.4.1-Setup.exe): HEAD 200, 246,720,645 bytes; 16-byte HTTP 206 range begins with MZ.
- [Download ZIP](https://github.com/Awser42/Software/releases/download/v1.4.1/AliExpress-Product-Archiver-1.4.1-Download.zip): HEAD 200, 246,722,428 bytes; 16-byte HTTP 206 range begins with PK.
- Published full-file checksums from the tested artifact: Setup `bb1c845e9c7efd58f7ffa17528efb84b3caf85973d780321e55d91132c415167`; Download ZIP `7cc509df7337cb336ffd1a2d65f450ec3737dc4342b078bbd2434f96ad4a5f42`. Independent large-binary checks fetched only 16 bytes each, not the complete files.
- The full public code ZIP was downloaded and inspected: 65,280 bytes; SHA-256 `f8d12a4b0a301dacfaccf4fc1955704058c3ba83660c93ac42cd8f141bbb77cc`. Its exact 19 safe regular src/ files matched all declared byte counts and hashes; bootstrap.js, Electron, Chromium and node_modules are excluded. ZIP hash matched both update-manifest.json and SHA256SUMS. Manifest SHA-256 `c0a55e27370cd0776fc0cc1f17ed070014c230019660195508406950b86dd1d4` also matched SHA256SUMS. Runtime compatibility remains Electron 44.9.3, Playwright 1.64.1 and code line 1.4. This independent public check inspected the code archive without executing it.

The separate [public live audit](https://github.com/Awser42/Software/releases/download/v1.4.1/Live-product-check.json), recorded `2026-10-21T11:00:16.624Z`, attempted product `3256812916711444` with bundled Chromium and no account session. Status was `manual-login-required`, title null and all description/feature/specification/variation/price/image counts zero. It did not validate live logged-in account fields or prices. Login/verification must be completed manually by the user. Fixture amounts above are never substituted for real product data.

The following reports belong to earlier releases.

## Version 1.4.0

This revision addresses the supplied Christmas-tree export ZIP (product ID `3256812916711444`). Inspection found a valid title and two priced size rows, empty Description and Seller Description, six 1200×1200 product images, unrelated 600×600 graphic content, a 48×48 play icon and a 60×60 star. The image files themselves were intact; the app had also forced thumbnail previews into 360×240, distorting square originals.

Implemented behavior:

- Semantic UI/avatar exclusion and specific product-gallery sources, decoded tiny-image filtering, content deduplication, original JPEG preservation and aspect-correct main-image previews. Recent earlier card previews can be repaired from existing ZIPs without rewriting those exports.
- Broader native overview and lazy Description-tab capture, observed inline description HTML and endpoint lists, independent seller content and frames. Missing text remains blank with explicit warnings; pictures and specifications are not turned into invented prose.
- CSV columns place Title, Variation, Price, Size and Color together, followed by Description, Seller Description, Features, Specifications and Images. A companion formatted product.xlsx has Product Details and Variations sheets, widths, wrapping, frozen headers and filters.
- One persistent headed Chromium session runs minimized by default; explicit Show/Hide controls preserve login, and manual verification pauses without forcing the browser forward. The app can keep processing in the Windows system tray.
- The full 1.4.0 package adds a stable update loader. Subsequent compatible app-code updates download a small ZIP that omits Electron, Chromium and node_modules, with exact runtime checks, integrity checks, staging and failed-start recovery. Portable restart targets the outer launcher rather than its temporary extracted executable.

Local validation passed on 2026-10-21:

- `npm test`: 59 tests passed, zero failures or skips. This includes nine small-updater integrity/compatibility/rollback cases, real image decoding, 48/60-pixel icon filtering, description lazy tabs/inline modules, styled Excel XML, duplicate image aliases and bounded legacy-preview repair.
- `bash scripts/test-ui-linux.sh`: passed. The 30-product streaming batch plus the initial product produced 31 ZIPs, all checked for the ten-column CSV, product.xlsx and six genuine 320×192 JPEGs (186 total). Per-product titles, seven expanded overview points, independent full seller DOM/endpoint/frame text and images, per-size visible fixture prices, sizes/colors/features/specifications and image paths matched. Manual Show/Hide commands reused the same profile; folder/settings, pause/resume, retry, duplicates and persistence passed.
- The actual uploaded ZIP's original 48×48 play and 60×60 star JPEGs were rejected by the decoded-image filter. Other retained original JPEG bytes stayed unchanged. Its empty description cells could not be recovered from images or specifications and were not fabricated. The unrelated 600-pixel art is handled by source/DOM scoping, not a guessed pixel-content classification.
- The companion workbook was independently loaded with openpyxl; its sheets, widths, wrapping, freezes, filters, literal formula-like strings and observed price text were valid.

The first native Windows candidate, [run 39575180105](https://github.com/Awser42/Software/actions/runs/39575180105), passed all 59 unit tests, packaged-source/browser-byte verification and the full 30-product desktop workflow, including the Windows tray and minimized/normal window assertions. Its packaged acceptance test then timed out waiting for the full load event of a controlled fixture navigation in minimized Chromium. Production navigation already uses domcontentloaded. The test was corrected to await that DOM milestone and the actual price field while preserving the price, JPEG, CSV and update assertions. No release was published from the failed candidate.

Source-entry validation also passed after correcting Electron default-app startup: an actual Electron launch with the repository path and an isolated user-data directory opened the real link grid and reported version 1.4.0 through both the desktop IPC and bootstrap context, even though process.mainModule.filename was electron. Ordinary Node imports remain side-effect free, and all nine updater tests passed again. The intermediate Windows run was intentionally superseded before publication to include this source-startup fix.

Native Windows candidate [run 39577928036](https://github.com/Awser42/Software/actions/runs/39577928036), source `6dc4d1e040bdb1a7f9148210ac2811b4d6953b70`, passed all 59 unit tests, source/browser byte verification and the full 30-product desktop workflow. Windows assertions confirmed Chromium minimized → normal → minimized, explicit manual showing, same session reuse and tray/close-to-background continuation while the batch remained active. All 31 product exports retained their CSV, formatted workbook and 186 decoded JPEGs. The actual packaged Windows EXE passed visible-price/all-column/JPEG assertions and then installed a controlled synthetic 1.4.1 code-only update, reopened with the existing runtime/dependencies, retained settings and marked startup healthy. That update transport was a test fixture; no public 1.4.1 release or live account price is claimed.

The actual portable acceptance in run 39577928036 connected to its local debugging endpoint but timed out locating the app renderer before update staging; publication was blocked. Subsequent distribution-test retries reuse the completed 30-product batch only when a Git comparison verifies every app, dependency, browser-build and desktop-fixture input against source 6dc4d1e040bdb1a7f9148210ac2811b4d6953b70 and the authenticated GitHub job record confirms that exact run/step passed. Rebuilt package, visible-price/export, code-update and actual portable acceptance checks still run. Raw target, context and optional read-only inspector diagnostics are included in the portable test.

The next diagnostic candidate, [run 39580874208](https://github.com/Awser42/Software/actions/runs/39580874208), confirmed the portable baseline UI, settings save and clean exit. Its updated 1.4.1 renderer also loaded, but the test had attached CDP while the initial target was still blank and could not discover that renderer. Read-only native diagnostics showed the updated window loaded without rollback. The harness now waits for the real index.html target before attaching, with bounded reconnects; a real delayed-Electron probe reproduced the early blank target and passed the wait and disconnect/reconnect checks. Application code was unchanged by this test correction.

Final native Windows distribution validation and publication passed in [run 39582800932](https://github.com/Awser42/Software/actions/runs/39582800932), tested commit `d31244de84c1a87165109b3594524a94c6378128`:

- Fresh 59-test unit/archive suite, packaged-source/browser-byte verification, actual packaged EXE export/update acceptance, code-update build and portable compression passed.
- The authenticated evidence guard verified unchanged application, dependency, browser-build and desktop-fixture inputs against `6dc4d1e040bdb1a7f9148210ac2811b4d6953b70` and the successful 30-product step in run 39577928036. It reused that completed batch evidence; this final run did not repeat the batch.
- The actual self-extracting portable EXE opened version 1.4.0, saved settings, exited and cleaned its temporary runtime. The same outer EXE reopened into a verified synthetic 1.4.1 code update, retained output/background/timing settings and marked startup healthy without a booting marker. All UI, IPC version and healthy-pointer assertions passed. Update transport was controlled test data, not a public 1.4.1 release.
- All artifact uploads and the gated public publisher passed. Tag `v1.4.0` targets the tested commit above. No failed candidate was published.

Anonymous public delivery checks passed on 2026-10-21:

- [Windows EXE](https://github.com/Awser42/Software/releases/download/v1.4.0/AliExpress-Product-Archiver-1.4.0-win-x64.exe): HEAD 200, 203,959,072 bytes; 16-byte HTTP 206 range starts with MZ.
- [Download ZIP](https://github.com/Awser42/Software/releases/download/v1.4.0/AliExpress-Product-Archiver-1.4.0-Download.zip): HEAD 200, 203,960,654 bytes; 16-byte HTTP 206 range starts with PK.
- [Published SHA256SUMS](https://github.com/Awser42/Software/releases/download/v1.4.0/SHA256SUMS.txt): GET 200. EXE SHA-256 `3f3d7295353e96f8b79b8e74cd5799d6d3e719cae1dd191ea0d34e1f6f8a0533`; ZIP SHA-256 `598b324345dd8d3a6ccaa9a55f3a6627ebced72ed6796d6b5f8b68aec1511761`. These full-file hashes were generated by the publisher from the tested artifacts; the independent large-file probes downloaded only 16 bytes each.
- The complete public code-update ZIP was independently downloaded: 64,488 bytes, SHA-256 `b26f4c2307d7b37f5ad86fc5c075f810aaa19a4910b88c7ddbd73f9499e282da`, matching both the manifest and SHA256SUMS. Its exact 19-file set, safe regular src/ paths, individual lengths and hashes matched the manifest. It excludes bootstrap.js, Chromium, Electron and node_modules. Manifest version is 1.4.0, runtime Electron 44.9.3 / Playwright 1.64.1, compatibility line 1.4 and entry src/main.js. It was inspected, not executed by the independent download check.

The [separate public live audit](https://github.com/Awser42/Software/releases/download/v1.4.0/Live-product-check.json), recorded at `2026-10-21T10:14:17.670Z`, attempted the supplied Christmas product `https://www.aliexpress.us/item/3256812916711444.html` using bundled Chromium with no account session. AliExpress redirected to its `/_____tmd_____/punish` verification page. Status was `manual-login-required`, title null and all description, feature, specification, variation, price and image counts zero. Live account prices and this product's live description were not validated. The user must complete login/verification manually in Show Chromium; missing content is not fabricated.

Linux dummy Xorg does not provide Windows tray/minimize behavior. The actual Windows results above cover those states and both packaged and portable update startup. Earlier version reports below are retained for history.

## Version 1.3.0

Local unit validation passed: `npm test` ran 39 tests with no failures or skips. This includes the modern full-title/seven-point overview fixture, independent seller content, lazy/original image handling, preview-class exclusion regressions, per-variation image mapping, ten CSV fields, safe measured DOM-only variations and all earlier stale-price tests.

`bash scripts/test-ui-linux.sh` also passed the complete desktop workflow: real spreadsheet-cell paste for 15/20/30 links; a 30-product streaming batch plus the initial product produced 31 ZIPs. All 31 CSVs were checked for the exact ten fields, per-product visible titles, all seven asynchronously expanded overview points, independent full seller DOM/endpoint/iframe text, per-size visible $8.15/$6.40 prices, size/color mapping, features/specifications and valid relative image paths. Six genuine 20×12 JPEG files per ZIP were decoded (186 JPEGs total), and every source image/description endpoint/frame was observed. Manual verification, pause/resume, duplicates, retry and persistence passed.

Native Windows validation passed in [run 39566799028](https://github.com/Awser42/Software/actions/runs/39566799028), tested source `c4a81cc8f63e2a52536a9166af96fea8bd86621c`:

- All 39 unit tests passed on Windows.
- Packaged runtime source matched the checkout; bundled Chromium matched its build manifest SHA-256.
- The real desktop grid/30-product streaming workflow passed using shipped Chromium, including full field checks on all 31 ZIPs and all 186 JPEGs.
- The actual packaged Windows EXE exported all ten CSV columns with visible per-variation prices and decodable JPEG output.
- The separate anonymous live-page check recorded `manual-login-required`. No supplied account was used, and no live product fields or account-specific prices were validated.

Portable compression, artifact upload and public version 1.3.0 publication all passed in that run. The release tag `v1.3.0` points to the exact tested source above.

Anonymous public download checks passed on 2026-10-21:

- [Windows EXE](https://github.com/Awser42/Software/releases/download/v1.3.0/AliExpress-Product-Archiver-1.3.0-win-x64.exe): HTTP 200; 203,963,351 bytes; HTTP 206 range begins with `MZ`.
- [Download ZIP](https://github.com/Awser42/Software/releases/download/v1.3.0/AliExpress-Product-Archiver-1.3.0-Download.zip): HTTP 200; 203,964,495 bytes; HTTP 206 range begins with `PK`.
- [Checksum manifest](https://github.com/Awser42/Software/releases/download/v1.3.0/SHA256SUMS.txt): HTTP 200. EXE SHA-256: `a0dda714f4a5c965f5b11c7facb86b37c5ec89fb7702535a0c1ba0b0b90ea265`; ZIP SHA-256: `406bfd110918997402ee9ee78441cf151ea4c241c4c2ec8994e16a09b0921077`.
- [Live check audit](https://github.com/Awser42/Software/releases/download/v1.3.0/Live-product-check.json): HTTP 200. The shipped Chromium attempted the supplied URL at `2026-10-21T08:12:30.642Z` using a fresh profile without an account session. It recorded `manual-login-required`, the original final URL, null title and zero extracted description/feature/specification/variation/image counts. This is evidence of the live attempt reaching a verification requirement, not successful live extraction.

The public delivery probes fetched only 16 bytes per binary; the full-file hashes were generated by the publisher from the tested artifact before upload and were not independently recomputed by those probes. The $8.15/$6.40 values in the automated workflow are controlled fixture prices, not verified prices for the user's live product. Previous-version results below are historical.

The new export contract is product.csv with Title, Description, Seller Description, Variation, Price, Size, Color, Features, Specifications and Images, plus actual JPEG files in Images/. Observed preferred AI overview and independent full seller description/images must both be retained. Visible main titles take precedence over stale background metadata. Per-variation prices require actual confirmed UI selections. Unknown values remain blank.

Required checks cover spreadsheet-like 15/20/30-link paste, 30-product streaming, per-product titles, seven expanded AI points, independent seller DOM/endpoint/iframe text and images, exact size/color price rows, observed features/specifications, real JPEG bytes/dimensions and the native packaged Windows EXE. A separate anonymous live-product check must record its actual result rather than claiming a logged-in account test.

The earlier version reports are retained below for history.

## Corrected embroidery product URL

After the release, the user supplied the corrected product link `https://www.aliexpress.us/item/3256811699433017.html`. Its tracking/cart query parameters were removed for the product check; query-string prices were not used as product-price evidence.

The focused native Windows [run 39569653984](https://github.com/Awser42/Software/actions/runs/39569653984) passed setup, matching compact Chromium download, production extraction attempt, public audit recording and evidence upload. It used the unchanged application extraction source from version 1.3.0, not a newly built release. The [recorded audit](validation/live-products/3256811699433017.json) shows an actual attempt at `2026-10-21T08:30:18.504Z` with no account session. AliExpress redirected the browser to `https://www.aliexpress.us//item/3256811699433017.html/_____tmd_____/punish`, a verification page. Status was `manual-login-required`, title was null, and all extracted field/image/variation counts were zero. A successful audit job here means the attempt and its access limitation were recorded; it does not mean live extraction succeeded.

Independent normal HTTPS and Chromium probes from the cloud workspace also failed before reaching the origin, with proxy tunnel HTTP 403 / `ERR_TUNNEL_CONNECTION_FAILED`, for both the corrected `.us` URL and the standard `.com` URL. No live title, description, images or variation prices were validated for this product. The user must complete login/verification manually in the app's visible Chromium before account-specific extraction can be checked. The existing v1.3.0 download remains the previously tested artifact, with unchanged source and checksums.

## Previous visible-price releases

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

Native Windows checks passed in [run 39561531136](https://github.com/Awser42/Software/actions/runs/39561531136), tested source `77b88b622ef06d66fae5275ca175743b5bc97ca7`:

- All Windows unit/archive tests passed, including the delayed multi-option pricing regressions.
- Packaged source matched the repository, and the bundled Chromium bytes matched the manifest SHA-256.
- The shipped-Chromium desktop test passed the ten-product batch and all CSV/JPEG checks with the visible $8.15 fixture price rather than the hidden $99.00 amount.
- The actual packaged Windows EXE launched bundled Chromium, selected and confirmed the visible $8.15 option, and exported that price using the packaged price/archive modules. Its JPEG was decoded and verified at 20×12 pixels.

Portable compression, artifact upload and public version 1.2.1 publication also succeeded in that run. The release tag `v1.2.1` points to the exact tested source above.

Anonymous public download checks passed:

- [EXE](https://github.com/Awser42/Software/releases/download/v1.2.1/AliExpress-Product-Archiver-1.2.1-win-x64.exe): HTTP 200; 203,956,885 bytes; HTTP 206 range begins with `MZ`.
- [Download ZIP](https://github.com/Awser42/Software/releases/download/v1.2.1/AliExpress-Product-Archiver-1.2.1-Download.zip): HTTP 200; 203,957,933 bytes; HTTP 206 range begins with `PK` ZIP bytes.
- [Public checksum manifest](https://github.com/Awser42/Software/releases/download/v1.2.1/SHA256SUMS.txt): HTTP 200. EXE SHA-256: `ad87c9b797ef5abba1626b009657894d54abc7145fb1d724e4dc8b802e8899f6`; ZIP SHA-256: `70c106c17ea687aad62ab80e989dc852e5dfd797f34f573209bc213381ba7a6d`.

Only 16 bytes per binary were fetched for independent public delivery/signature checks; full-file hashes above were generated by the publisher from the tested artifact before upload. The earlier candidate run was deliberately canceled before publication after review found the multi-option timing issue; the tested source above includes the fix. Results below belong to the preceding version.

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

The supplied product URL `https://www.aliexpress.us/item/3256810248416998.html` was attempted from this cloud machine on 2026-10-21; the HTTPS proxy rejected the connection with HTTP 403 before an AliExpress page loaded. The separate native Windows GitHub run later attempted the same URL using shipped Chromium and recorded `manual-login-required`, with no account session and no extracted product fields. Neither attempt validated logged-in account prices. The public version 1.3.0 live audit above records the Windows result.

Controlled fixtures verify extraction and export behavior. They do not establish a live account-specific AliExpress price or guarantee compatibility with every live product. No real account login or CAPTCHA completion is claimed by fixture tests. Login takes place manually in the visible Chromium window.

Price, currency, region, coupons, taxes and shipping can affect the final checkout amount. Missing values are never estimated. Native Windows behavior must be supported by an actual Windows run; a Linux test alone does not establish it.

## Windows user check

Run the portable EXE, click Open Chromium / Login, and sign in. Set your country/currency, paste 15, 20 or 30 full product links into the numbered cells and Run. Each completed product should appear in Latest saved product and Downloads while later links continue.

Inspect each version 1.4.0 ZIP: it should contain `product.csv`, `product.xlsx` and the `Images/` folder. Open `product.xlsx` for the readable Product Details and Variations sheets; the CSV retains all ten columns for import. Compare the captured fields with the logged-in page. Select each exported variation in Chromium and compare its visible current price with that row's Price and its Size/Color values. Confirm that missing or unconfirmed prices remain blank instead of receiving a hidden SKU amount. Increase Page / variation settling time if the page updates slowly. Where available, Description should contain the complete observed AI overview and its disclaimer; otherwise it should contain the lower seller description. Seller Description should independently retain the observed lower seller text. Features and Specifications must match observed page content. Confirm that all Images paths resolve, the files open as JPEGs and matching variation images are included. Review warnings in the app for unavailable fields or images.
