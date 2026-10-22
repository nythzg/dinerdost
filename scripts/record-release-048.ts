import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const read = (path: string) => readFile(path, "utf8");
const json = async (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n");
const deployLog = (await read("verification/vercel-048-deploy.log")).replace(
  /\r/g,
  "",
);
const deployment = JSON.parse(
  deployLog.slice(deployLog.indexOf('{\n  "status"')),
).deployment;
assert.equal(deployment.readyState, "READY");
assert.match(await read("verification/production-048-browser.log"), /4 passed/);
const access = JSON.parse(
  await read("verification/production-public-048.json"),
);
const preservation = JSON.parse(
  await read("verification/production-048-preservation.json"),
);
assert.equal(access.passed, true);
assert.equal(preservation.accepted, true);
const verifiedAt = new Date().toISOString();
await json("verification/production-048-acceptance.json", {
  version: "0.4.8",
  deploymentId: deployment.id,
  productionUrl: deployment.productionUrl,
  accepted: true,
  verifiedAt,
  requests: "Q39-Q42",
  latestBatchReleased: "Q27-Q42",
  localBrowserPassed: 4,
  productionBrowserPassed: 4,
  publicChecksPassed: access.checks,
  priorInvoicesPreserved: preservation.priorInvoicesPreserved,
  typecheckPassed: true,
  buildPassed: true,
  schemaChanged: false,
  fullPrdComplete: false,
  phoneHardwareAcceptance: false,
});
const release = JSON.parse(await read("docs/RELEASE.json"));
Object.assign(release, {
  version: "0.4.8",
  productionVersion: "0.4.8",
  deploymentId: deployment.id,
  deploymentUrl: deployment.url,
  previousProductionVersion: "0.4.7",
  previousProductionDeploymentId: "dpl_EX5DX3Pc5AnGEStoX9GH92YUFrEp",
  verifiedAt,
  featureUpdate:
    "All latest Q27-Q42 web requests released. Phone Ingredient contrast verified; two-finger content pinch zoom; premium dotted fixed frame and visible actual-layout bounding box. Prior merged-card, Menu and expiry changes retained.",
  latestWebQueueItemCount: 16,
  latestWebQueueImplemented: 16,
  latestReviewQueue: {
    ...release.latestReviewQueue,
    requests: 25,
    implemented: 25,
    ids: "Q18-Q42",
    latestBatch: "Q27-Q42",
    pendingImplementation: 0,
    status: "Deployed and verified through Q42",
  },
  localVerification: {
    ...release.localVerification,
    currentReleaseBrowserWorkflowsPassed: 4,
    typecheckPassed: true,
    optimizedBuildPassed: true,
  },
  currentReleaseHostedCasesPassed: 0,
  hostedIntegrationTestsPassed: 0,
  hostedVerificationScope:
    "UI-only 0.4.8; prior 0.4.7 grouped billing and 0.4.6 merge/demerge PostgreSQL acceptance retained. No additional backend changes.",
  productionBrowserWorkflowsPassed: 4,
  productionPublicChecksPassed: access.checks,
  issuedDocumentCountPreserved: preservation.priorInvoicesPreserved,
  acceptanceEvidence: "verification/production-048-acceptance.json",
});
await json("docs/RELEASE.json", release);
let checklist = await read("docs/CLIENT_FEEDBACK.md");
checklist = checklist.replace(/^- \[ \] \*\*Q(39|40|41|42) /gm, "- [x] **Q$1 ");
checklist += `

## Production acceptance · 0.4.8

All **Q39–Q42** are deployed and verified at https://dinerdost-app.vercel.app, deployment **${deployment.id}**. All **16 latest requests Q27–Q42** are now released across 0.4.6–0.4.8. The Ingredient phone button reuses the corrected 0.4.7 contrast; its normal, hover and keyboard-focus colours and form opening passed. Pinch zoom works around the midpoint with a fixed dotted frame; the actual floor has a visible dotted bounding box in View/Arrange. Pinching does not open a table, change browser-page zoom, move/resize objects or leave an unintended selection. Existing pan, wheel, keyboard, Fit and saved-outline/rotation behavior passed.

All **four affected local** and **four live browser workflows** passed, with explicit multi-touch events and phone viewport checks. The initial pinch check caught selection changing under the first finger; selection is now restored and the final assertion passes. Final typecheck and optimized local/Vercel builds passed. All **${access.checks} public-access checks** passed. No backend/schema change; all **${preservation.priorInvoicesPreserved} prior invoice digests** are unchanged, with KOT authority retained. Physical phone acceptance is not claimed by browser touch emulation.

For 0.4.7's six unique live workflows, five passed in the main run; its final separate-bill case initially reached the existing signup limit and then passed using an existing synthetic QA account and a fresh QA table. No rate limit was weakened. See the [affected live rerun](../verification/production-047-billing-rerun.log).

Evidence: [acceptance](../verification/production-048-acceptance.json), [local](../verification/web-048-final-acceptance.log), [live](../verification/production-048-browser.log), [access](../verification/production-public-048.json), [preservation](../verification/production-048-preservation.json), [phone Ingredient](../verification/ingredient-phone-contrast.png), [pinch](../verification/explore-pinch-phone.png). Recipe data/blocking policy, Android/Firebase, providers, packages and remaining offline/native v2 work remain deferred. No Discord messages were sent.
`;
await writeFile("docs/CLIENT_FEEDBACK.md", checklist);
let v2 = await read("docs/V2_CHECKLIST.md");
v2 = v2
  .replace("12 latest requests Q27–Q38", "16 latest requests Q27–Q42")
  .replace("0.4.6/0.4.7", "0.4.6–0.4.8")
  .replace(
    "and the Menu button contrast correction.",
    "the Menu/Ingredient contrast corrections, two-finger Explore zoom and dotted viewport/layout bounds.",
  );
await writeFile("docs/V2_CHECKLIST.md", v2);
let readme = await read("README.md");
readme = readme
  .replace("version **0.4.7**", "version **0.4.8**")
  .replace("12 latest web requests Q27–Q38", "16 latest web requests Q27–Q42")
  .replace(
    "and readable Menu header controls.",
    "readable Menu/Ingredient controls; two-finger Explore zoom; and dotted viewport/layout bounding boxes.",
  );
await writeFile("README.md", readme);
await writeFile(
  "docs/VERIFICATION.md",
  `# Release verification · 0.4.8

Verified on **21 October 2026 (India time)**, deployment **${deployment.id}** at https://dinerdost-app.vercel.app/. All 16 latest requests Q27–Q42 are released. This UI-only follow-up adds content pinch zoom and dotted viewport/layout bounds, and verifies Ingredient-button contrast on phone.

Four affected local and four production workflows passed, including real multi-touch event emulation, stable layout/selection, one-finger pan, saved geometry and readable phone controls. Typecheck, optimized local/Vercel builds and all ${access.checks} anonymous-access checks passed. No backend or schema change; all ${preservation.priorInvoicesPreserved} prior invoice digests remain unchanged and KOT authority stays enabled. Physical device acceptance and earlier client/provider/native/package deferrals remain separate.

Evidence: [acceptance](../verification/production-048-acceptance.json), [local](../verification/web-048-final-acceptance.log), [live](../verification/production-048-browser.log), [public](../verification/production-public-048.json), [preservation](../verification/production-048-preservation.json), [cleanup](../verification/production-048-cleanup.json).

---
` + (await read("docs/VERIFICATION.md")),
);
console.log("0.4.8 acceptance and canonical checklist recorded.");
