# Cloud acceptance checks (requires provisioned Supabase project)

- Sign in with the allowlisted user; verify the nine seeded nodes save and remain after refresh.
- Create a second authenticated user without adding it to workspace_owner; verify load_workspace and save_workspace both reject access. Anonymous calls must also be rejected.
- Verify the publishable key cannot select or modify objectives, workspaces or workspace_owner directly.
- Open the owner workspace in two independent browser sessions. Edit/save A; edit B without refreshing. B must show a conflict and retain a downloadable draft. Reload B; A's changes must be present.
- Send malformed snapshots (duplicate occupied slot, nonexistent parent, cross-root child, cycle, blank title) through save_workspace. Verify errors and that the previous saved nodes/revision remain intact.
- Disconnect network, edit, close/reopen and restore connection. Check the draft restores at matching revision and saves. A changed remote revision must require explicit recovery.
- Export, delete a root, import the backup. Check descriptions, nesting, completion states and timestamps, with fresh IDs.
- Sign out and confirm no private nodes appear. Verify a fresh device can sign in and retrieve the latest accepted save.
