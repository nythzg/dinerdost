import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const read = (path: string) => readFile(path, "utf8");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + "\n");
const log = (await read("verification/vercel-049-deploy.log")).replace(/\r/g, "");
const deployment = JSON.parse(log.slice(log.indexOf('{\n  "status"'))).deployment;
assert.equal(deployment.readyState, "READY");
assert.match(await read("verification/web-049-browser-acceptance.log"), /2 passed/);
assert.doesNotMatch(await read("verification/web-049-typecheck-final.log"), /error TS/);
assert.match(await read("verification/web-049-build.log"), /Compiled successfully/);
const results = [];
for (const [path, status] of [["/signin", 200], ["/api/workspace", 401], ["/preview", 404]] as const) {
  const response = await fetch(deployment.productionUrl + path, { redirect: "manual" });
  assert.equal(response.status, status, path);
  assert.ok(!(response.headers.get("set-cookie") ?? "").includes("dd_session="));
  results.push({ path, status: response.status });
  await response.arrayBuffer();
}
const verifiedAt = new Date().toISOString();
await json("verification/production-049-acceptance.json", {
  version: "0.4.9", deploymentId: deployment.id, accepted: true, verifiedAt,
  productionUrl: deployment.productionUrl, request: "Q43",
  localBrowserPassed: 2,
  localBoundaryCoverage: "Four edges, desktop 1440 and phone 390, View and Arrange, normal size and 400 percent zoom; 32 edge placements. Saved object styles unchanged. Touch pinch regression passed.",
  liveBrowserVerification: { method: "Existing authorized in-app browser, read-only", dottedFrame: true, clipInstalled: true, overflow: "hidden", clipPath: "inset(2px round 12px)", boundarySamples: 36, allSamplesClear: true, zoomAndScrollChecked: true, clientTablesModified: false },
  syntheticLiveRun: { completed: false, log: "verification/production-049-before.log", reason: "Timed out waiting for a new synthetic signup to reach Overview. No boundary assertion executed in that run. Used the existing authorized browser for live verification instead; no authentication or rate-limit settings changed." },
  publicChecks: results,
  typecheckPassed: true, optimizedBuildPassed: true,
  backendChanged: false, schemaChanged: false,
  previousFinancialPreservationEvidence: "verification/production-048-preservation.json",
  currentInvoiceHashesRechecked: false, physicalPhoneAcceptance: false,
});
const release = JSON.parse(await read("docs/RELEASE.json"));
Object.assign(release, {
  version: "0.4.9", productionVersion: "0.4.9", deploymentId: deployment.id,
  deploymentUrl: deployment.url, previousProductionVersion: "0.4.8",
  previousProductionDeploymentId: "dpl_7c2bKXkQLC2uCo3a3cDwAGgHYN6T", verifiedAt,
  featureUpdate: "Q43 released: all moving Explore contents are clipped inside the fixed outer dotted frame during navigation and Arrange. Table positions, floor size, pinch and scrolling retained.",
  latestWebQueueItemCount: 17, latestWebQueueImplemented: 17,
  latestReviewQueue: { ...release.latestReviewQueue, requests: 26, implemented: 26, ids: "Q18-Q43", latestBatch: "Q27-Q43", status: "Deployed and verified through Q43" },
  localVerification: { ...release.localVerification, currentReleaseBrowserWorkflowsPassed: 2 },
  productionBrowserWorkflowsPassed: 1, productionPublicChecksPassed: results.length,
  productionVerificationMethod: "Read-only authorized in-app browser; 36 border probes after zoom/scroll. Separate new synthetic signup timed out; no automated live boundary workflow claimed.",
  hostedVerificationScope: "UI-only clipping layer. No backend, schema or data writes; prior PostgreSQL acceptance retained.",
  acceptanceEvidence: "verification/production-049-acceptance.json",
});
await json("docs/RELEASE.json", release);
let checklist = await read("docs/CLIENT_FEEDBACK.md");
checklist = checklist.replace("- [ ] **Q43", "- [x] **Q43");
checklist += `\n\n## Production acceptance · 0.4.9\n\n**Q43 is deployed and verified**, deployment **${deployment.id}**, at https://dinerdost-app.vercel.app/app/floor-plan. The user clarified the outer fixed dotted frame as the hard boundary. A separate stationary rounded clipping layer now contains every moving floor element, including tables, fixtures, handles and the inner layout box, leaving the main dotted border visible. Actual floor geometry and saved positions are unchanged. Scrolling, panning, pinch, zoom and Arrange remain available.\n\nTwo affected local browser workflows passed: four-edge clipping at 1440px and 390px in View/Arrange at normal and 400% zoom (32 placements), unchanged object geometry, and two-finger pinch regression. The first boundary test was corrected to wait for tables to load and to explicitly exercise both magnifications. Final typecheck and optimized local/Vercel builds passed. Live verification used the existing authorized in-app browser: clipping installed, dotted frame retained, all 36 sampled border points clear after zoom/scroll. The separate new synthetic signup run timed out before reaching a boundary assertion, so it is not counted as a passing live automated workflow. No authentication/rate-limit setting was changed. Three anonymous smoke checks passed.\n\nThis is a UI-only change, with no backend/schema/data mutation. The prior 0.4.8 invoice hash preservation evidence remains historical; no new invoice hash audit is claimed for 0.4.9. Existing recipe/provider/native/package deferrals remain unchanged. No client table was modified and no Discord message was sent.\n\nEvidence: [acceptance](../verification/production-049-acceptance.json), [local edge/pinch checks](../verification/web-049-browser-acceptance.log), [phone frame](../verification/explore-hard-frame-390-view.png), [desktop frame](../verification/explore-hard-frame-1440-view.png).\n`;
await writeFile("docs/CLIENT_FEEDBACK.md", checklist);
let v2 = await read("docs/V2_CHECKLIST.md");
v2 = v2.replace("16 latest requests Q27–Q42", "17 latest requests Q27–Q43").replace("0.4.6–0.4.8", "0.4.6–0.4.9").replace("dotted viewport/layout bounds.", "dotted viewport/layout bounds and hard clipping inside the outer frame.");
await writeFile("docs/V2_CHECKLIST.md", v2);
let readme = await read("README.md");
readme = readme.replace("version **0.4.8**", "version **0.4.9**").replace("16 latest web requests Q27–Q42", "17 latest web requests Q27–Q43").replace("dotted viewport/layout bounding boxes.", "dotted viewport/layout bounding boxes; and hard clipping within the main outer frame.");
await writeFile("README.md", readme);
await writeFile("docs/VERIFICATION.md", `# Release verification · 0.4.9\n\nDeployment **${deployment.id}** is ready on the production alias. Q43 adds a stationary rounded clipping layer within Explore's dotted outer frame. No backend, schema, financial or saved-layout data change.\n\nBoth affected local browser cases passed, including 32 edge placements across desktop/phone, View/Arrange and normal/400% zoom, unchanged positions and pinch regression. Typecheck and optimized local/Vercel builds passed. Existing authorized live browser verification confirmed the clipping layer and 36 clear border samples after zoom/scroll. A separate synthetic-signup run timed out before a boundary check; it is not claimed as passing. Three anonymous smoke checks passed. Physical phone acceptance is separate.\n\nEvidence: [acceptance](../verification/production-049-acceptance.json), [local](../verification/web-049-browser-acceptance.log), [build](../verification/web-049-build.log). Prior invoice hashes were checked for 0.4.8; that historical evidence is unchanged and was not rerun for this CSS/markup-only fix.\n\n---\n` + await read("docs/VERIFICATION.md"));
console.log("0.4.9 deployed; checklist, verification and three public smoke checks recorded.");
