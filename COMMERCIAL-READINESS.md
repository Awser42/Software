# Commercial Readiness Review

Version: 1.4.8. Scope: Windows x64 desktop product archiving, not a commercial certification or penetration test. Controlled fixtures are not evidence of live-account prices or permission to use merchant content.

## 1.4.8 export changes

- Stable product-scoped Variant IDs and Design IDs link observed option combinations to Excel rows and JPEG filenames. Full original options, confirmation status and currency markers are explicit.
- A third Image Map sheet records image roles and original sources. Known photos of other designs are excluded from a variant; generic shared/reference media is labelled and is not treated as proof of a physical size or included hoop.
- Design-dependent size lists are explored even when the initial catalog appears complete. Required choices cleared by a design change are selected from enabled controls and freshly priced before recording.
- Controlled screenshot-shaped tests exercise C1 without hoop at $5.25 and with 20cm hoop at $6.89, equal prices across different designs, changing size lists, source-image isolation, stable identities and unconfirmed catalog rows. These are fixture tests; other prices in those fixtures are synthetic.
- Native Windows installation/live-account results recorded for earlier releases do not establish native Windows acceptance for this local build. See the supplied build/check results for this version.

## Fixed And Covered

- Pricing completeness: partial catalogs previously stopped at one hoop/size per design. A reproducer captured 4 instead of 12 combinations. Actual enabled UI choices now fill the missing combinations, reusing known catalog rows without inventing unselected options. Tests cover one design/three hoops, four designs/three hoops and 24 independent design/size/hoop combinations.
- Price attribution: visible options must match the complete combination even when a selected-SKU marker is stale. Loading/stale/range/coupon/shipping/crossed-out/hidden amounts are not substituted for a confirmed variation price. A failed freshness check leaves unknown prices blank and warns. Capture limits warn explicitly; discovery is not an unlimited completeness guarantee.
- Export integrity: every measured combination retains its own options, confirmed cost and matching JPEG references. Shared originals download/decode once. Independent workbook/ZIP readers check actual exports. Earlier v7 captures can be recaptured as v8 without deleting their ZIPs.
- Data recovery: flushed temporary writes atomically replace saved history. A local backup mirrors successful state, including deletions. A corrupt primary is preserved and recovered from a valid backup; unrecoverable corruption stops startup with a visible error. A backup-refresh error is logged; a local mirror is not a substitute for an external backup or a guaranteed power-loss-proof database.
- Queue recovery: initial/claim persistence failures release the run and preserve unstarted work/attempt counts. A failed add rolls back its own still-pending links, without deleting unrelated changes. Full multi-operation database transactions and high-contention fault injection are outside this review.
- Operational errors: output-folder failures appear as errors, keep work pending and can be corrected/retried. Folder changes are blocked during processing. Individual product failures stay separate and persistent; retries and record deletion preserve exported files.
- Browser isolation: products use separate tabs/response collectors with bounded pending JSON captures. Product API responses require genuine HTTPS AliExpress hostnames, not a matching query/subdomain suffix. Windows Chromium explicitly requests its sandbox. The Linux cloud test preserves its earlier launch configuration because the environment does not permit the needed sandbox namespaces; it is not evidence of Linux sandbox security.
- Desktop boundaries: the Electron renderer uses context isolation, sandboxed preferences, no Node integration, CSP, a whitelisted preload and main-frame IPC checks. App navigation/new windows are denied. Native browser-window commands check process identity and cannot target the software process.
- Update integrity: fixed repository/approved HTTPS hosts, bounded ZIP paths/sizes, source hashes/CRC, installed-file verification and startup rollback remain covered. Checksums are integrity checks, not an independent publisher signature. Runtime compatibility remains pinned; existing installations need only a small code update.
- Dependency hygiene: runtime and build audits must report zero known npm advisories before publication. The build-only `global-agent` override removes the vulnerable `roarr`/`sprintf-js` chain while retaining the downloader's bootstrap API; a real local proxy-forwarding test covers compatibility. No runtime dependency version was changed.
- Responsiveness/performance: five views retain responsive layouts, reduced-motion support, search/pagination and stable archive targets. Rendering checks cover 2,000 records and notification bursts. Already visited combinations are skipped; settling/freshness checks and image quality are not shortened to claim a speedup.

## Release-Owner Gates

1. Obtain an Authenticode certificate and sign the Windows installer/executables. The installer is currently unsigned. Do not advertise a verified publisher yet.
2. Validate representative real AliExpress products in authorized sessions: different account currencies/regions, design/size/pack combinations, removed/sold-out listings, login/CAPTCHA, network interruptions and long-running batches. The screenshot confirms only the displayed selected option; unknown prices are not inferred.
3. Review AliExpress/platform terms, product-photo/text reuse rights and branding before sale or redistribution. Manual login and conservative delays do not establish permission.
4. Publish privacy, support, refund/license and update policies. Browser profiles contain sensitive sessions; they remain on the user's device. Provide account-sign-out/profile-removal guidance before transferring a machine. No cloud account, billing or licensing system was added without requirements.
5. Establish signed release ownership, protected CI/repository access, dependency monitoring, externally backed-up data and a tested incident/rollback/support process. Local history mirrors can be lost with the device.
6. Test target Windows hardware/antivirus/proxies and the actual Lite first-browser download. Installer acceptance uses a seeded, verified pinned cache and does not establish a live first-download result. Confirm disk capacity for large variation/image sets.

## Evidence

The release workflow runs unit, dependency audit, responsive UI, real desktop batch, record recovery, failure-folder, existing-EXE update and actual Lite installer checks before publication. `Windows-update-check.json`, `Failed-links-check.json`, `UI-performance-check.json`, `Dependency-audit.json`, `Lite-installer-check.json` and `VALIDATION.md` record observed results and limits. Until the release workflow completes, local checks must not be represented as native Windows acceptance.
