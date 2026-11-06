# Mandaloom

Mandaloom is a private, cloud-based visual thinking and goal-planning application inspired by the Japanese Mandala Chart (Mandalart) methodology.

A private recursive Mandala workspace built with Next.js App Router, React, TypeScript, Tailwind CSS, shadcn-style Radix button components, and Supabase Auth/Postgres. Ready to deploy to Vercel.

## Run locally

Requires Node 20.9+ (Node 24 LTS recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without Supabase environment variables the app runs in **local demo mode**, with the trading firm example and browser-only storage. The demo never uploads data. It is not a replacement for private cloud authentication.

## Connect your private cloud workspace

1. Create a Supabase project.
2. Run `supabase/migrations/001_workspace.sql` once in its SQL editor.
3. In Authentication settings, disable public signups. Create your own email/password user through the Supabase dashboard. Use a strong unique password. Password recovery can be handled through the dashboard for this personal MVP.
4. Copy that user's UUID and run this administrative SQL (replace the placeholder):

```sql
insert into public.workspace_owner(user_id) values ('YOUR-AUTH-USER-UUID');
```

Only provision your own account. No account can read/write a workspace unless its UUID is in this allowlist. Database tables have RLS enabled and no client policies; access is exclusively through authenticated, owner-checked functions. The schema can accommodate separate accounts later, but this deployment is intended for one allowlisted user.

5. Copy `.env.example` to `.env.local`, then fill in the Supabase project URL and **publishable** key from Project Settings → API Keys. Never use the service-role or secret key in a `NEXT_PUBLIC_` variable.
6. Restart the development server. Sign in. The initial trading-firm Mandala is seeded when a new empty cloud workspace loads.

Authentication uses Supabase's browser session client; no server-rendered private data is embedded in pages. Every cloud RPC independently verifies the authenticated owner. Signing out is blocked while pending changes cannot be saved. On shared computers, sign out and remove downloaded backups and local recovery drafts as appropriate.

## Deploy to Vercel

Push this folder to your GitHub repository, import it into Vercel as a Next.js project, and set both environment variables from `.env.example` for the intended deployment environments. Deploy. In Supabase Auth URL Configuration, set the production Site URL to your Vercel domain. No service-role key is required. Your GitHub, Vercel and Supabase account actions and credentials must be supplied by you.

## Use

- The centre is the current objective, not a duplicate node. Click a surrounding objective to open its own grid, and an empty cell to create one.
- Edit any objective with its three-dot menu; edit the centre with “Edit objective”. Choose a grid position to swap it with an occupied cell. Completion is independent for each objective.
- Create separate roots with “New Mandala”. Use breadcrumbs, Back to parent, or the hierarchy explorer to navigate. Search covers titles and descriptions across all roots and depths.
- Changes queue automatically and save approximately every 1.5 seconds. “Saved to cloud” confirms the database accepted the change. Unsaved changes trigger a leave-page warning and keep a recovery draft.
- Export downloads all roots, descendants, descriptions, completion states and timestamps as a versioned flat JSON backup. A flat model avoids JSON nesting limits. Import validates the hierarchy and adds copies with fresh IDs, preserving metadata and existing work. Import files are limited to 10 MB as a browser safeguard; nesting depth has no fixed limit.
- Deletion requires confirmation and removes the entire selected subtree. Export regularly for durable backups.

## Reliability and conflicts

Cloud saves replace the node snapshot in one Postgres transaction, guarded by a locked workspace revision. Invalid structures, duplicate cells, broken references and cycles roll back the transaction. Two devices cannot silently overwrite each other: the stale device stops saving and offers recovery download and cloud reload. Download the recovery file, reload the cloud version, and import the recovery if you want to retain both versions as separate Mandalas. Edits made in a matching-revision recovery draft restore on next load. Older-revision drafts require explicit recovery.

While the database supports arbitrary depth, browser memory and workspace size affect performance. This MVP loads the whole personal workspace and renders a flat explorer; it is not virtualized for huge datasets. It polls the save queue, not remote changes: reload to retrieve edits from another device. A stale editor detects conflicts when attempting to save. There is no background sync while the page is closed.

## Validate

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npx playwright test
```

Model tests cover 12,000 nested levels, import ID remapping, metadata preservation and invalid structures. Local Postgres tests execute the actual migration and verify ownership, stale revisions, invalid snapshots and transactional rollback. Browser tests cover navigation, editing, reorder, search, local persistence, import/export, completion, deletion and responsive layout. You may use an installed Edge browser instead of downloading Chromium by setting `PLAYWRIGHT_CHANNEL=msedge`. Cloud authentication and two-device database behavior additionally require a real Supabase project; follow `tests/CLOUD-CHECKLIST.md` before considering deployment verified.

Free hosting tiers may cover personal usage but provider quotas and pricing determine actual cost.
