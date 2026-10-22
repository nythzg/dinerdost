import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
const read = (path: string) => readFile(path, "utf8");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + "\n");
const log = (await read("verification/vercel-0410-deploy.log")).replace(/\r/g, "");
const deployment = JSON.parse(log.slice(log.indexOf('{\n  "status"'))).deployment;
assert.equal(deployment.readyState, "READY");
for (const path of ["verification/web-0410-categories.log", "verification/production-0410-categories.log"])
  assert.match(await read(path), /1 passed/);
assert.doesNotMatch(await read("verification/web-0410-typecheck.log"), /error TS/);
assert.match(await read("verification/web-0410-build.log"), /Compiled successfully/);
const publicChecks = [];
for (const [path, status] of [["/signin", 200], ["/api/workspace", 401], ["/preview", 404]] as const) {
  const response = await fetch(deployment.productionUrl + path, { redirect: "manual" });
  assert.equal(response.status, status, path);
  assert.ok(!(response.headers.get("set-cookie") ?? "").includes("dd_session="));
  publicChecks.push({ path, status: response.status });
  await response.arrayBuffer();
}
await rm("verification/.qa-production-0410.json", { force: true });
const verifiedAt = new Date().toISOString();
await json("verification/production-0410-acceptance.json", {
  version: "0.4.10", deploymentId: deployment.id, productionUrl: deployment.productionUrl,
  accepted: true, verifiedAt, request: "Q44",
  source: "https://discord.com/channels/@me/1491679750610096259/1562482293409452092",
  readThrough: "2026-10-21T20:36:00+05:30", localBrowserPassed: 1, productionBrowserPassed: 1,
  coverage: "1440px and 390px POS category buttons: 48px minimum target, 16px readable labels, rounded boxes for all categories, contrast, horizontal reachability, keyboard activation, filtering, search and unchanged unsent cart",
  existingClientReadOnlyBrowserCheck: true, publicChecks,
  typecheckPassed: true, optimizedBuildPassed: true, backendChanged: false, schemaChanged: false,
  clientRecordsChanged: false, productionTestScope: "One synthetic QA workspace; an unsent cart only; no order, payment or invoice created",
  temporaryQaAuthenticationRemoved: true, financialHashesRechecked: false, physicalPhoneAcceptance: false,
});
const release = JSON.parse(await read("docs/RELEASE.json"));
Object.assign(release, {
  version: "0.4.10", productionVersion: "0.4.10", deploymentId: deployment.id, deploymentUrl: deployment.url,
  previousProductionVersion: "0.4.9", previousProductionDeploymentId: "dpl_DNtqYSfuZreXsXiVEXcBF51ND8KN", verifiedAt,
  featureUpdate: "Q44 released: larger rounded Cashier POS category buttons, with readable labels and horizontal phone scrolling. Category/search filtering and cart contents preserved.",
  feedbackReadThrough: "2026-10-21T20:36:00+05:30", latestWebQueueItemCount: 18, latestWebQueueImplemented: 18,
  latestReviewQueue: { ...release.latestReviewQueue, requests: 27, implemented: 27, ids: "Q18-Q44", latestBatch: "Q27-Q44", readThrough: "2026-10-21T20:36:00+05:30", status: "Deployed and verified through Q44" },
  localVerification: { ...release.localVerification, currentReleaseBrowserWorkflowsPassed: 1 },
  productionBrowserWorkflowsPassed: 1, productionPublicChecksPassed: publicChecks.length,
  productionVerificationMethod: "Automated synthetic QA desktop/phone workflow and read-only existing client browser inspection",
  hostedVerificationScope: "UI-only POS category controls; no backend/schema changes or financial writes",
  acceptanceEvidence: "verification/production-0410-acceptance.json",
});
await json("docs/RELEASE.json", release);
let checklist = await read("docs/CLIENT_FEEDBACK.md");
checklist = checklist.replace("- [ ] **Q44", "- [x] **Q44");
checklist += `\n\n## Production acceptance · 0.4.10\n\n**Q44 is deployed and verified** on https://dinerdost-app.vercel.app/app/pos, deployment **${deployment.id}**. Prem's 8:36 pm screenshot matches Cashier POS's category strip. Every category now has a rounded box, larger 16px label and at least 48px touch target; the active category retains the approved dark green. The strip remains horizontally scrollable on phones. Changes are scoped to the pictured POS controls; customer menu and unrelated tab styling remain unchanged. Category selection is exposed accessibly to keyboard/screen-reader users.\n\nOne affected local browser workflow and the same production workflow passed at **1440px and 390px**: box size, readable contrast, untruncated labels, horizontal reachability, keyboard focus/activation, category filtering, search and unchanged cart contents. The test uses an isolated synthetic workspace and an unsent cart; it creates no order, payment or invoice. Read-only inspection of the existing client's live POS confirmed the requested design. Typecheck and optimized local/Vercel builds passed, along with three anonymous smoke checks. Temporary QA authentication state was removed. No backend/schema change or client-record mutation. Earlier financial-preservation checks remain historical; no new invoice hash audit or physical-phone acceptance is claimed for this UI-only release.\n\nLatest Discord cutoff: **21 October 2026, 8:36 pm IST**. Recipe data/policy, Android/Firebase, providers and package setup remain deferred. No Discord message was sent.\n\nEvidence: [acceptance](../verification/production-0410-acceptance.json), [local](../verification/web-0410-categories.log), [production](../verification/production-0410-categories.log), [desktop strip](../verification/pos-category-strip-1440.png), [phone](../verification/pos-category-boxes-390.png).\n`;
await writeFile("docs/CLIENT_FEEDBACK.md", checklist);
let v2 = await read("docs/V2_CHECKLIST.md");
v2 = v2.replace(/\*\*New request under implementation:\*\* Q44[^\n]+\n\n/, "")
  .replace("17 latest requests Q27–Q43", "18 latest requests Q27–Q44")
  .replace("0.4.6–0.4.9", "0.4.6–0.4.10")
  .replace("hard clipping inside the outer frame.", "hard clipping inside the outer frame, and larger rounded POS category controls.")
  .replace("Latest Discord cutoff: **21 October 2026, 4:39 am IST**", "Latest Discord cutoff: **21 October 2026, 8:36 pm IST**");
await writeFile("docs/V2_CHECKLIST.md", v2);
let readme = await read("README.md");
readme = readme.replace("version **0.4.9**", "version **0.4.10**")
  .replace("17 latest web requests Q27–Q43", "18 latest web requests Q27–Q44")
  .replace("hard clipping within the main outer frame.", "hard clipping within the main outer frame; and larger rounded POS category buttons.");
await writeFile("README.md", readme);
await writeFile("docs/VERIFICATION.md", `# Release verification · 0.4.10\n\nQ44 is deployed on the production alias, deployment **${deployment.id}**. POS category labels are larger, every category has a rounded box, and phone overflow stays inside the category strip. Only POS category CSS and selection accessibility changed.\n\nOne local and one production workflow passed at 1440px/390px, including size/contrast/label fit, horizontal reachability, keyboard activation, filtering, search and preserved cart contents. Typecheck, optimized local/Vercel builds and three anonymous smoke checks passed. Read-only client-browser inspection matched the screenshot. No backend/schema/client financial changes; no new invoice hash audit or physical-phone acceptance is claimed. QA authentication state removed. Deferred scopes remain separate.\n\nEvidence: [acceptance](../verification/production-0410-acceptance.json), [local](../verification/web-0410-categories.log), [production](../verification/production-0410-categories.log), [desktop strip](../verification/pos-category-strip-1440.png), [phone](../verification/pos-category-boxes-390.png).\n\n---\n` + await read("docs/VERIFICATION.md"));
await json("verification/discord-monitor-latest.json", {
  checkedAt: verifiedAt, conversation: "https://discord.com/channels/@me/1491679750610096259",
  latestReviewedMessageAt: "2026-10-21T20:36:00+05:30", newMessagesAfterCutoff: 1, newRequirements: 1,
  method: "Authorized Discord browser; new screenshot inspected and deduplicated; Q44 implemented/tested/released",
  currentProductionVersion: "0.4.10", currentChecklistThrough: "Q44", implementationPending: 0,
  deferred: ["Client recipe data and missing-recipe blocking policy", "Android and Firebase", "External providers", "Package configuration"],
  checklistCrossReferenceCurrent: true, discordMessagesSent: 0, deploymentNeeded: false,
});
console.log("0.4.10 accepted: Q44 released; checklist/V2 updated; QA credentials removed.");
