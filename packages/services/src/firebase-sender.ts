import { GoogleAuth } from "google-auth-library";
import { ensure } from "@dinerdost/core";
import type { PushSender } from "./push";

/** Server credentials only. No service-account material is included in an Android build. */
export function firebaseSender(): PushSender | null {
  const project = process.env.FIREBASE_PROJECT_ID;
  if (!project) return null;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  ensure(/^[a-z][a-z0-9-]{4,62}$/.test(project), "PUSH_SETUP_REQUIRED", "Check the Firebase project configuration.", 503);
  let credentials;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); }
    catch { ensure(false, "PUSH_SETUP_REQUIRED", "Check the server's Firebase credentials.", 503); }
    ensure(credentials && typeof credentials === "object" && (!credentials.project_id || credentials.project_id === project), "PUSH_SETUP_REQUIRED", "Check the Firebase sender project.", 503);
  }
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    clientOptions: { transporterOptions: { timeout: 4000, retry: false } },
    ...(credentials ? { credentials } : {}),
  });
  return async hint => {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken.token) return { status: "RETRY", code: "SENDER_AUTH_UNAVAILABLE", retrySeconds: 300 };
    const suffix = hint.application === "MASTER" ? "" : "." + hint.application.toLowerCase();
    const result = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
      method: "POST", signal: AbortSignal.timeout(4000),
      headers: { Authorization: `Bearer ${accessToken.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { fid: hint.fid,
        // Data-only hints contain no customer, order, payment or employee information.
        data: { kind: "INBOX_SYNC", binding_id: hint.bindingId, event_id: hint.eventId },
        android: { priority: "high", ttl: "300s", restricted_package_name: "com.dinerdost.app" + suffix },
      } }),
    });
    if (result.ok) return { status: "SENT" };
    const body = await result.json().catch(() => ({})) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    const code = body.error?.details?.find(detail => detail.errorCode)?.errorCode ?? body.error?.status ?? `HTTP_${result.status}`;
    if (code === "UNREGISTERED") return { status: "INVALID", code };
    if (result.status === 429 || result.status >= 500) return { status: "RETRY", code, retrySeconds: Math.min(3600, Math.max(60, Number(result.headers.get("Retry-After")) || 60)) };
    return { status: "FAILED", code };
  };
}
