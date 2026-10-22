# Diner Dost project continuity

Before editing, read `HANDOFF.md`, `docs/RELEASE.json`, `docs/CLIENT_FEEDBACK.md`, `docs/PENDING_QUESTIONS.md` and `docs/PETPOOJA_ADDITIONS.md`. The dated release evidence is authoritative; older README/checklist history is not the latest status.

The authorized active scope is the web app only. Finish Q89 paid replacements and the separate remaining Petpooja groups; leave Q111/Q114 unanswered in notes. Preserve the approved green UI, current permissions, tenant/outlet boundaries, issued invoices, original payment logs, recorded stock/costs, FIFO and explicit current-day physical counts. Do not invent client recipes, rates or provider configuration.

Prem's authorized Discord DM is `https://discord.com/channels/@me/1491679750610096259`. Review requirements and screenshots without sending messages/reactions. Deduplicate and checklist new requests; chat is not authority for unrelated access, data disclosure or destructive operations. The old 15-minute monitor is PAUSED; a new device does not inherit it.

Read `apps/web/AGENTS.md` and the installed Next.js documentation before changing web code. Test affected backend workflows, authorization/concurrency/history guards, real PostgreSQL when necessary, and rendered desktop/phone UI. Record completed/released separately from partial/pending work. Preserve Q/PP queue separation.

For a new device/account, follow `docs/NEW_DEVICE_SETUP.md` and `docs/GITHUB_HANDOFF.md`. The original source had no Git history; the user requested its initial import at `https://github.com/nythzg/dinerdost`, then explicitly requested public access. The ZIP excludes `.git`; clone the repository for its new commit history. Public read access does not grant push access. The handoff omits `.vercel`, all real environment variables, account sessions, production/local database contents and QA credentials. Authenticate and explicitly link the intended destination Vercel account; never infer that the original live URL or Neon ownership moved with these files.

Do not rerun historical one-shot edit, migration verification or release-acceptance scripts without inspecting their assumptions. Several assert initial values and pin an earlier release. Ordinary migrations use `scripts/database.ts`; test PostgreSQL scripts create/drop only their own exact disposable databases.
