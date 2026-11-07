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
2. Run the SQL files in `supabase/migrations/` once each, in numerical order (001–004).
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
- Edit any objective with its three-dot menu; edit the centre with “Edit objective”. Choose a grid position to swap it with an occupied cell. Status is independent for each objective: Not started, In progress, Blocked or Complete. Only Complete counts toward the grid's completion total.
- The editor also stores an optional deliverable, multiline completion criteria and next action, alongside the existing description. These fields are available at every level and remain in the editor. Cancel discards the edit; Save changes commits the draft to the autosave queue.
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

## Private ChatGPT plugin

Mandaloom includes an authenticated MCP endpoint for reading grids, creating objectives, editing progress fields and batch-populating empty cells. It uses the existing Supabase login with explicit owner consent, revocable read/edit grants and idempotent revision-checked writes. See [private plugin setup](docs/PRIVATE-PLUGIN.md) before connecting. Apply migration 003 and configure the native Supabase OAuth server and token hook; no service-role key or OpenAI API key is needed. The source package is in `plugin/mandaloom/`. These optional features do not change normal grid editing.

## Upgrade an existing cloud workspace to progress tracking

Export a JSON backup first. Apply **only** `supabase/migrations/002_objective_progress.sql` in the Supabase SQL editor before deploying this version. Do not rerun 001 on an existing database. This transaction adds the progress columns and updates the RPCs, maps completed objectives to Complete and all others to Not started, preserves descriptions/positions/timestamps, and increments existing workspace revisions to reject stale saves. The old completed database column remains a derived compatibility mirror; status drives the UI and all completion counts. Older app clients must refresh before saving. The new app refuses to edit an unmigrated cloud database rather than silently lose progress fields.

Local data, recovery drafts and imported version-1 backups upgrade automatically on read (including missing completed flags). Current exports use backup version 3 and preserve all progress fields and reference counters. They are not intended for older app versions. Existing recovery drafts from before the database revision change can still be downloaded and imported as copies.

## Grid references

Each objective/grid has a short nesting reference: `R` for a root, `R.1` for a supporting objective, `R.1.1` for its child. The full reference adds its Mandala number: `M001/R.1.1`. These references are unique within your workspace; internal UUIDs remain the permanent database identity. Each extra segment is one level deeper. The centre uses the current objective's reference, not a duplicate.

Numbers are assigned in initial grid order, then sequentially as new objectives are saved. They are independent of grid positions: swapping cards does not rename their references. Deleted child numbers are not reused because their parent's next-number counter is retained. The workspace's root counter likewise survives deleting every root. Cancelling a new objective does not consume a number. Consequently a new objective in the first grid cell may have a later number such as `R.9` after previous children were deleted.

References are shown on cards, in the hierarchy and editor, and above the active grid. Copy reference copies the full unique form. Search accepts short or full references. Plugin reads and mutation results include `reference`, `fullReference` and `depth`; use search to resolve a full reference to an objective UUID before editing.

For an existing cloud workspace, export a backup and apply **only** `supabase/migrations/004_grid_references.sql` after 003 before deploying this update. The migration preserves objective content, identities, timestamps, nesting, positions and completion states. It assigns existing numbers and increments revisions to reject stale saves. Browser/plugin save functions enforce immutable existing numbers and monotonically increasing counters. Old clients that omit the new fields cannot reset stored numbers. The updated application requires this migration to edit cloud data.

Local storage, recovery drafts and older JSON backups are upgraded on read. Version-3 exports include node numbers, per-parent counters and the workspace root counter. Import is additive: copies receive new root prefixes to avoid collisions, while child reference segments and deletion gaps are preserved. No cross-parent move is supported in the current editor or plugin; if introduced later, that operation will need an explicit reference-change policy.

## Due dates and priority

Every objective, including roots and nested objectives, has an optional date-only dueDate and priority (Normal by default, High or Low). Dates do not inherit or change status. Cards show non-Normal priorities and any deadline; unfinished objectives show Due today or Overdue based on the browser's local calendar. Completed objectives retain their date without an overdue warning. Clear the date input to remove a deadline. JSON backups and plugin read/create/update/populate tools include these fields. Older backups default to no date and Normal priority.

Before deploying this update, apply only supabase/migrations/005_objective_planning.sql in the Supabase SQL editor, after 004. Export a backup first. This preserves existing content, statuses, timestamps, nesting and references; existing rows receive no due date and Normal priority. It increments workspace revisions so open tabs must reload. The save RPC preserves stored planning fields when older clients omit them. Updated clients require planningVersion 1 before editing cloud data. Then deploy the app and refresh open tabs.

## Permanent grid links

Each root or nested grid uses a readable path such as /m/M001/R.1.2. It resolves the existing permanent reference numbers, independent of titles and positions. Older /?grid=<objective UUID> bookmarks still work and are replaced with the readable URL after sign-in and workspace loading. Navigation updates browser history without reloading or saving data. Refresh, bookmarks, copied links and Back/Forward restore the exact objective after authentication and workspace loading. Renames and position swaps leave links unchanged. Copy link beside the reference copies the full URL. Plugin objective results and breadcrumbs also include a url. Links do not grant access: the existing private sign-in and owner restrictions still apply. Missing/deleted IDs show a notice and replace the URL with an available root (or / for an empty workspace). No database migration is required.

Backspace opens the current grid's parent. It does nothing at a root, while an editor is open, or in text/select controls. Modified keys and held-key repeats do not trigger navigation. The Back to parent button also advertises the shortcut.

## Long text editing

All objective text fields grow with their content without inner scrollbars. Expand opens a larger modal editor with regular-weight text, character count, keyboard focus containment, Escape/Cancel to discard that field draft, and Done to return it to the objective editor. Save changes is still required to persist the objective; cancelling the objective discards all draft edits. Completion criteria supports an explicit Make checklist action in expanded mode: each non-empty line becomes an unchecked text item, existing checklist markers and blank lines remain intact. Separate milestones with blank lines; existing content is never rewritten automatically or converted into child objectives. Paragraphs and line breaks survive saving, reload and JSON export.

## Live cloud updates

Open grids follow committed MCP and other-browser changes automatically, preserving the current readable URL and search. Apply supabase/migrations/006_live_updates.sql after 005 for Supabase push notifications. Only owner-scoped revision metadata is published; objective text still loads through the existing private RPC. No objective/workspace table read grants are added. Browser-owner RLS excludes other users and OAuth client tokens. Failed transactions emit no committed update.

A five-second foreground fallback plus focus/online checks catches missed notifications; without 006 it temporarily uses the existing load RPC. With 006, unchanged revisions use a small revision RPC and skip downloading objectives. Open editors defer incoming snapshots. Cancelling a clean edit applies waiting updates; saving a draft against an externally changed workspace keeps the local recovery draft and shows the existing export/reload conflict workflow. Local demo mode remains local. Realtime subscriptions, timers and listeners are removed on sign-out/unmount. Updates appear after each committed tool operation, not token-by-token while ChatGPT is composing text.

Validation: npm test; PLAYWRIGHT_CHANNEL=msedge npx playwright test; PLAYWRIGHT_CHANNEL=msedge npx playwright test --config playwright.live.config.ts (mocked authenticated HTTP/WebSocket service; no production credentials or data).

## Objective timeline

The right-side timeline lists objectives across all Mandalas in ascending due-date order, grouped by calendar date. Choose Current Mandala to include that root and all its nested objectives. Completed objectives retain their dates and status; undated objectives appear under Unscheduled. References, status, non-Normal priority and overdue/today indicators accompany each entry. Selecting an entry opens its existing grid without changing objective data. The list follows saved edits and incoming workspace updates.

On screens narrower than 1360px, use Timeline in the header to open the right-side drawer. Close it with its close control or Escape; choosing an objective also closes it. Desktop and drawer lists share the same scope and chronological grouping. No database migration or new task dates are required.
