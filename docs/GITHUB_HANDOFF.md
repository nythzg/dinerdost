# GitHub source handoff

The user requested pushing the project to GitHub after preparing the portable device handoff, then explicitly requested public access on **23 October 2026 IST**. Destination: **public** [nythzg/dinerdost](https://github.com/nythzg/dinerdost), branch **main**. The connected GitHub account and Git credential account both resolve to `nythzg`.

The original source had no Git checkout, remote or history. This is the initial import of the currently verified **0.4.30** application, shared services/database/core packages, migrations 001–050, tests, repository documentation, continuation notes, selected nonsecret release evidence and comparison references. It does not recreate historical commits for earlier Vercel releases. Android source is retained as deferred historical work; generated builds, Firebase config, SDK paths and signing material are excluded.

No real environment variables, Codex/Vercel/Discord sessions, QA credentials, local/production databases or dependency/build caches are published. Selected verification files are deliberately added despite the broad verification ignore rule; do not force-add that whole directory later. The hashed source handoff manifest is used to audit the initial import before push.

On the receiving device, the public repository can be cloned without a GitHub invitation:

```sh
git clone https://github.com/nythzg/dinerdost.git
cd dinerdost
```

Open that folder in Codex and paste CONTINUE_IN_CODEX.txt. All project instructions and saved context are in AGENTS.md, HANDOFF.md and the docs checklist/notes. Public read access does not grant push access; the receiving operator needs an owner-granted write invitation or can use their own fork. No collaborator invitation was sent because no recipient was specified. The separately prepared ZIP can also be shared directly.

The initial-import HANDOFF_MANIFEST.json describes the audited files of commit `8fbd2c4`; later handoff-documentation updates do not change the verified application code. The original ZIP is a dated snapshot, not a continuously updated download.

The receiving operator must authenticate/link their own Vercel project and configure authorized database access as described in NEW_DEVICE_SETUP.md. GitHub source access does not grant Vercel/Neon ownership or sign-in access to Discord. No Git-to-Vercel auto-deployment integration was configured by this import; the accepted production release remains 0.4.30 on the existing Vercel project.

Remaining work at import: **Q89** paid replacement; **Q111/Q114** unanswered in notes; separate PP queue **4 complete, 2 partial, 21 pending**. Earlier 15-minute monitor stays **PAUSED**. Preserve financial history, stock/FIFO, permissions, approved green UI and the web-only scope.
