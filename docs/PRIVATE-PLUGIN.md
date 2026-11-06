# Private Mandaloom plugin

The endpoint is `https://mandaloom.vercel.app/mcp` (stateless MCP Streamable HTTP). It uses the official TypeScript MCP SDK and the existing Vercel/Supabase deployment. It does not call an OpenAI model or require an OpenAI API key. ChatGPT supplies the reasoning and calls these tools.

The private plugin is saved to the owner's account: [Mandaloom](https://chatgpt.com/plugins/plugins_6aee40d83ff4819180225579be24078d). Plugin ID: `plugins_6aee40d83ff4819180225579be24078d`. Initial release ID: `pluginrel_6aee40d9b870819196a7c18531c6d1c8`. Reuse this identity for future updates; do not create duplicate plugins. Installation and OAuth connection are separate from creation.

Version 0.1.1 links the verified ChatGPT app `asdk_app_6aee4a78df248191b643e2f22f5f9b95` (Mandaloom connection) through `.app.json`. Release: `pluginrel_6aee4c28c68c819186911bc5be366f72`. The original plugin's instructions and identity are preserved. Its raw MCP server map is now empty to avoid a second connection. Keep the underlying Mandaloom connection installed/authorised. This is a private, account-specific package; it is not a public-directory submission package.

## One-time Supabase setup

1. Apply `supabase/migrations/003_private_plugin.sql` in the Supabase SQL editor **after 001 and 002**. This preserves objectives and adds connection grants, idempotency receipts and protected RPCs. Do not rerun earlier migrations.
2. Under Authentication → OAuth Server, enable OAuth and Dynamic Client Registration. Use Site URL `https://mandaloom.vercel.app` and Authorization Path `/oauth/consent`. Keep public signups disabled; only the allowlisted workspace owner can grant data access.
3. Under Authentication → Hooks, select the Postgres **Custom Access Token** hook `public.mandaloom_access_token_hook`. If a custom access-token hook is already configured, merge this hook's claim logic into it instead of replacing unrelated policy. It preserves normal browser claims. OAuth tokens for explicitly granted clients receive the canonical MCP `resource`, data permissions and grant version. Tokens without the hook are rejected by the MCP server.
4. Use asymmetric signing keys (ES256/RS256) in Authentication → Signing Keys if not already enabled. This enables native OIDC ID-token support and JWKS verification. Follow Supabase's rotation process; don't delete a key while existing sessions still depend on it.

Supabase remains the OAuth authorization server: it handles PKCE, dynamic client registration, authorization codes and refresh-token rotation. Mandaloom does not implement its own OAuth token issuer or store client secrets. No service-role key is used.

## Connect

Install the private plugin package built from `plugin/mandaloom/` through Plugin Creator, then connect its Mandaloom server in the host. Alternatively, add the MCP URL above in ChatGPT's custom MCP/plugin connection settings, using OAuth with dynamic client registration. Availability and the exact menu depend on your ChatGPT account/workspace.

The host discovers `/.well-known/oauth-protected-resource/mcp`, then Supabase's authorization-server metadata. Sign in on Mandaloom's consent page using your existing account. Confirm the client name, ID and return address. Choose read-only or read-and-edit, then Allow access. Never paste account passwords or access/refresh tokens into chat or a plugin file.

The native OAuth scopes (`openid`, `profile`, `email`) govern identity information. **They do not grant database editing permissions.** Separate owner-approved permissions are enforced in both the MCP handler and Postgres. A token must have a verified signature, the expected Supabase issuer and audience, valid expiry, the canonical `resource`, an OAuth client ID and a matching live grant version. Plain browser tokens, unrelated OAuth tokens and revoked grants cannot use the plugin data RPCs. OAuth clients cannot use the browser's unrestricted snapshot RPCs or the private internal functions to bypass read-only access.

At `/connections` you can revoke access immediately. This removes the live database grant before asking Supabase to revoke its OAuth grant. If the provider call fails, remove the connection in ChatGPT too before reconnecting. Revoked or changed grants invalidate even previously issued, unexpired tokens. Data/receipt tables have RLS enabled with no direct client policies.

## Tools

After reference migration 004, reads and write results also include short grid references (`R.1.1`), globally unique workspace references (`M001/R.1.1`) and depth. Search accepts reference text. Resolve it to the returned exact objective ID before editing. Cell swaps preserve references. The plugin server and browser use the same numbering/counter logic; apply 004 before deploying the reference-enabled app.

| Tool | Behavior |
| --- | --- |
| get_connection | Stable owner ID, data permissions, revision |
| list_mandalas | Root summaries and revision |
| get_grid | Centre, eight supporting positions, children and breadcrumbs |
| get_objective | All objective/progress fields and location |
| get_subtree | Paginated flat hierarchy in grid order; depth is not capped |
| search_objectives | Paginated title/description matches with IDs and paths |
| create_objective | Root or one objective in an empty supporting cell |
| update_objective | Supplied text/status fields only; keeps position and descendants |
| populate_grid | Atomic batch of 1–8 new objectives in empty cells under one parent |

There are no delete, reparent or move tools. Creation never replaces existing content. All writes require a recently read revision and a requestId UUID. A reused ID with the same parsed arguments returns the stored result; different arguments are rejected. Receipts are scoped to the user and OAuth client and persist across server restarts. Stale revisions are rejected without automatic retries. Existing browser autosave uses the same database lock/revision, so browser and plugin changes cannot silently overwrite each other. Refresh the browser after plugin edits; pending stale drafts remain recoverable.

New objectives default to Not started. All editor fields and their existing limits are supported at any nesting level. Read pagination carries a revision to avoid mixing versions. Server requests are capped at 512 KiB. Each operation validates the full flat hierarchy before commit, using the existing atomic save function.

## Verify after setup

- `npm test`, `npm run typecheck`, `npx playwright test`, `npm run build`.
- MCP discovery must list nine tools without revealing workspace data anonymously. Unauthenticated tool calls must return an OAuth challenge. Tokens for another resource, browser-only tokens and expired tokens must fail.
- Connect read-only and read your existing grid. A write must fail, including a direct call to browser save_workspace. Reconnect with editing access.
- Explicitly request one test root, populate two cells, then edit one child. Confirm the results and fields in Mandaloom after reload. Repeat the same requestId/arguments and confirm no duplicate nodes. Remove the test root manually in the browser when finished.
- Keep a browser editor open, make a plugin change, then save the old browser edit. It must show a save conflict, keeping its recovery draft.
- Revoke the plugin connection and verify subsequent reads and writes fail even with an unexpired old token.

The automated tests use synthetic workspaces and local Postgres, not the owner's live objectives. Real OAuth consent and tool invocation require the user's login and these dashboard settings; a successful deployment or plugin upload alone does not prove that final linking succeeded.

### Priority and due-date tools (0.1.2)

The live create_objective, update_objective and populate_grid schemas accept fields.priority (Normal, High, Low) and fields.dueDate (YYYY-MM-DD, or empty string to clear). Omitted values on updates are preserved. The instruction package 0.1.2 documents this behavior and stale connection metadata. After a server schema change, refresh Mandaloom connection from its ChatGPT plugin detail page, then open a new chat; updating the instruction package alone does not refresh cached tool schemas. Keep the registered app binding unchanged. Verified live public tools/list exposes both fields in all three mutation tools; authenticated host writes still require refreshed descriptors.
