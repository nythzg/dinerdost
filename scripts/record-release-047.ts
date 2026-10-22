import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const read = (path: string) => readFile(path, "utf8");
const json = async (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n");
const log = (await read("verification/vercel-047-deploy.log")).replace(
  /\r/g,
  "",
);
const deployment = JSON.parse(
  log.slice(log.indexOf('{\n  "status"')),
).deployment;
assert.equal(deployment.readyState, "READY");
const live = await read("verification/production-047-browser.log");
assert.match(live, /5 passed/);
assert.match(
  await read("verification/production-047-billing-rerun.log"),
  /1 passed/,
);
const access = JSON.parse(
  await read("verification/production-public-047.json"),
);
const preservation = JSON.parse(
  await read("verification/production-047-preservation.json"),
);
assert.equal(access.passed, true);
assert.equal(preservation.accepted, true);
const acceptedAt = new Date().toISOString();
await json("verification/production-046-acceptance.json", {
  version: "0.4.6",
  deploymentId: "dpl_Cmc3hE986f82ciH9u1wXFL9kRm7t",
  productionUrl: deployment.productionUrl,
  accepted: true,
  requests: "Q27-Q36",
  localBackendPassed: 141,
  localBrowserUniquePassed: 59,
  hostedCasesPassed: 3,
  liveWorkflowsPassed: 8,
  publicChecksPassed: 17,
  preservedPriorInvoices: 26,
  schemaChanged: false,
  fullPrdComplete: false,
});
const acceptance = {
  version: "0.4.7",
  deploymentId: deployment.id,
  deploymentUrl: deployment.url,
  productionUrl: deployment.productionUrl,
  accepted: true,
  checkedAt: acceptedAt,
  requests: [
    "Q37 One merged table card with all member bills and original QR codes",
    "Q38 Menu/header contrast correction",
  ],
  latestBatchRequestsReleased: 12,
  latestBatchIds: "Q27-Q38",
  discordReadThrough: "2026-10-21T04:39:00+05:30",
  baselineFullBackendPassed: 141,
  affectedBackendPassed: 12,
  affectedHostedCasesPassed: 1,
  baselineBrowserUniquePassed: 59,
  affectedBrowserPassed: 6,
  finalAffectedBrowserPassed: 3,
  productionBrowserPassed: 6,
  publicChecksPassed: access.checks,
  priorInvoicesPreserved: preservation.priorInvoicesPreserved,
  schemaChanged: false,
  financialRecordsRewritten: false,
  fullPrdComplete: false,
  deferred: [
    "Client recipes and missing-recipe blocking policy",
    "Android/Firebase",
    "External providers",
    "Package configuration",
    "Remaining offline/native v2 work",
  ],
};
await json("verification/production-047-acceptance.json", acceptance);
const release = JSON.parse(await read("docs/RELEASE.json"));
Object.assign(release, {
  version: "0.4.7",
  productionVersion: "0.4.7",
  deploymentId: deployment.id,
  deploymentUrl: deployment.url,
  deploymentStatus: "production-ready-verified",
  previousProductionVersion: "0.4.6",
  previousProductionDeploymentId: "dpl_Cmc3hE986f82ciH9u1wXFL9kRm7t",
  verifiedAt: acceptedAt,
  feedbackReadThrough: acceptance.discordReadThrough,
  updatedAt: "2026-10-21",
  featureUpdate:
    "Q27-Q36 released, followed by one combined merged table card with all linked bills/QRs and a Menu/header contrast correction. No ledger or schema rewrite.",
  localVerification: {
    baselineFullBackendTestsPassed: 141,
    affectedBackendTestsPassed: 12,
    baselineBrowserWorkflowsPassed: 59,
    affectedBrowserWorkflowsPassed: 6,
    finalAffectedBrowserWorkflowsPassed: 3,
    typecheckPassed: true,
    optimizedBuildPassed: true,
  },
  currentReleaseHostedCasesPassed: 1,
  hostedIntegrationTestsPassed: 1,
  productionBrowserWorkflowsPassed: 6,
  productionPublicChecksPassed: access.checks,
  hostedVerificationScope:
    "New grouped billing case on isolated PostgreSQL; previous three merge/demerge cases passed for 0.4.6. No live tenant used for backend tests.",
  latestWebQueueItemCount: 12,
  latestWebQueueImplemented: 12,
  latestReviewQueue: {
    requests: 21,
    implemented: 21,
    pendingImplementation: 0,
    ids: "Q18-Q38",
    latestBatch: "Q27-Q38",
    readThrough: acceptance.discordReadThrough,
    status: "Deployed and verified through Q38",
    pendingClarification: 0,
    pendingClarificationIds: [],
    deferredRecipeConfiguration: true,
    providersDeferred: true,
    oldRoundsPreserved: true,
  },
  pendingMigrations: [],
  issuedDocumentCountPreserved: preservation.priorInvoicesPreserved,
  acceptanceEvidence: "verification/production-047-acceptance.json",
});
await json("docs/RELEASE.json", release);
const checklistPath = "docs/CLIENT_FEEDBACK.md";
let checklist = await read(checklistPath);
checklist = checklist.replace(/^- \[ \] \*\*Q(37|38) /gm, "- [x] **Q$1 ");
checklist += `

## Production acceptance · 0.4.7

**Q37–Q38 are deployed and verified** at https://dinerdost-app.vercel.app, deployment **${deployment.id}**. Together with 0.4.6, all **12 latest requests Q27–Q38** are released. The original recipe/provider/native/package deferrals remain unchanged.

The new grouped card combines current visible members, seats and guests, provides all linked bills, and preserves each physical table's QR, capacity and session. Demerge restores the individual cards. Explore retains the saved physical positions. Group billing enforces the current waiter/outlet/tenant scope; financial records are not consolidated or rewritten. Menu buttons, category selection and search have explicit readable colours; desktop/mobile controls were visually checked.

All **12 affected backend cases**, the **new isolated hosted group-billing case**, **six affected local browser workflows**, **three final affected workflows**, **six production workflows** and **${access.checks} public-access checks** passed. The previous release's full 141 backend/59 browser baseline remains recorded separately. An incorrect test selector for physical Explore objects was corrected; the final group restoration check passes. Typecheck and optimized local/Vercel builds passed. No schema migration; all **${preservation.priorInvoicesPreserved} prior invoice digests** are unchanged and KOT authority remains enabled.

Evidence: [acceptance](../verification/production-047-acceptance.json), [backend](../verification/web-047-backend.log), [hosted](../verification/web-047-postgres.log), [local affected](../verification/web-047-browser-acceptance.log), [final local](../verification/web-047-browser-final.log), [live](../verification/production-047-browser.log), [public checks](../verification/production-public-047.json), [preservation](../verification/production-047-preservation.json). Latest Discord cutoff remains **21 October 2026, 4:39 am IST**; the last review found no newer client requests. Direct user requests through Q38 are included. No Discord message was sent.
`;
await writeFile(checklistPath, checklist);
let v2 = await read("docs/V2_CHECKLIST.md");
v2 = v2.replace(
  /\*\*Latest web queue:\*\*[\s\S]*?(?=\r?\n\r?\nLatest additional chat review:)/,
  "**Latest web queue:** [CLIENT_FEEDBACK.md](CLIENT_FEEDBACK.md) records all **12 latest requests Q27–Q38 as deployed and verified in 0.4.6/0.4.7**. These include the expiry/interface updates, fixed Explore viewport, one merged card with guarded group billing/demerge and the Menu button contrast correction. Latest Discord cutoff: **21 October 2026, 4:39 am IST**, followed by the direct user requests. Production acceptance and evidence are in the canonical checklist. Recipe data, native/Firebase, external-provider and package configuration deferrals remain unchanged; the full v2 list below is not completed.",
);
await writeFile("docs/V2_CHECKLIST.md", v2);
let readme = await read("README.md");
const introEnd = readme.indexOf("In **Team**");
readme =
  `# Diner Dost

Working web application, version **0.4.7**, deployed and verified at https://dinerdost-app.vercel.app/. Built from DinerDost PRD v2.0 and the approved green layout with large navigation.

All **12 latest web requests Q27–Q38** are released: compact expiry controls and actual batch-expiry displays; report/table styling and spacing; reorder UI removal; corrected occupied-table controls; customer quantity cards; a fixed Explore frame with readable scrollable contents; guarded merge/demerge; one combined merged table card with all member bills and original QR codes; and readable Menu header controls. Historical financial records and permissions are preserved. This is not the complete native/offline enterprise platform. Client recipes, providers, Android/Firebase and package setup remain deferred. See the [client checklist](docs/CLIENT_FEEDBACK.md) and [verification](docs/VERIFICATION.md).

` + readme.slice(introEnd);
await writeFile("README.md", readme);
const verification = `# Release verification · 0.4.7

Verified on **21 October 2026 (India time)** at https://dinerdost-app.vercel.app/, deployment **${deployment.id}**. Q37's single merged card/group bills and Q38's Menu contrast correction are released. Q27–Q36 were released in 0.4.6; all 12 latest requested web updates are now accepted.

| Check | Result |
| --- | --- |
| Backend | 12 affected cases passed, including financial preservation, separate and grouped bill reads, and waiter/outlet/tenant isolation. Previous 0.4.6 full baseline: 141 passed. |
| Local browser | Six affected workflows plus three final workflows passed, covering three-member grouping, original QR/capacity controls, all member bills, demerge/restore, desktop/mobile rendering and Menu contrast. Previous full baseline: 59 unique passed across main/fixture reruns. |
| Hosted PostgreSQL | New grouped-billing case passed on an isolated temporary database; earlier three merge/demerge cases passed for 0.4.6. |
| Production | All six live workflows and ${access.checks} anonymous-access checks passed. Synthetic QA workspaces only for workflow writes. |
| Preservation | No schema migration; all ${preservation.priorInvoicesPreserved} previous invoice digests unchanged; KOT authority retained. Original table/session/QR/order/payment identities remain intact. |
| Build | Typecheck and optimized local/Vercel builds passed. |
| Limits | Client recipe data/blocking policy, Android/Firebase, providers, packages and remaining native/offline/full-v2 acceptance remain deferred. |

Evidence: [acceptance](../verification/production-047-acceptance.json), [local](../verification/web-047-browser-acceptance.log), [final local](../verification/web-047-browser-final.log), [backend](../verification/web-047-backend.log), [hosted](../verification/web-047-postgres.log), [live](../verification/production-047-browser.log), [access](../verification/production-public-047.json), [preservation](../verification/production-047-preservation.json), [merged control](../verification/grouped-tables-desktop.png), [Menu contrast](../verification/menu-contrast-390.png).

---
`;
await writeFile(
  "docs/VERIFICATION.md",
  verification + (await read("docs/VERIFICATION.md")),
);
console.log("Release 0.4.7 acceptance and canonical checklists recorded.");
