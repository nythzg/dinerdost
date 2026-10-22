# Platform loyalty configuration

The web loyalty claim limit defaults to ₹50 **per order/final bill**, shared across its rounds. Available balance, point-value increments and existing redemption eligibility may lower the amount shown. Earlier discounts and claims are never rewritten when this limit changes.

Restaurant Owner, Manager and other restaurant roles do not imply Diner Dost platform administration. An operator must explicitly provision the chosen authenticated user UUID in the server-only `DD_PLATFORM_ADMIN_USER_IDS` environment variable (comma-separated UUIDs). Leave it unset until the platform operator chooses the account. No human account has been auto-provisioned by this release.

A provisioned user sees **Configure loyalty cap** in the web Bill summary. The server independently checks that identity, the current authenticated restaurant and assigned outlet, plus the outlet version. It records an audited configuration change. This does not grant membership in another restaurant or broaden the user's ordinary role. An unprovisioned restaurant owner sees the limit as read-only.

This is an operational setup dependency, not a new unanswered billing-policy question. Q111 (next-visit bills) and Q114 (calculator reference behavior) remain the two unanswered items in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md). Existing phone verification/provider setup still applies; no OTP verification or loyalty balance is fabricated.
