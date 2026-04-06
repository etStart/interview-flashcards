# Progress Log

## Current State

The project is bootstrapped and working as a standard Vite + React + TypeScript app.

Build status:

- `npm run build` passes

Repository status:

- Local git repo initialized
- Initial commit created
- GitHub remote created under `etStart/interview-flashcards`
- Push to GitHub works through the SSH host alias `github-personal`

## Implemented

- Home screen with grouped entry points
- Study mode selection per group
- SRS review flow with `level 0-7`
- Card answer editing
- Backup export/import
- Supabase-ready local/cloud persistence flow
- Supabase schema file

## Important Files

- App logic: [`src/App.tsx`](./src/App.tsx)
- Styles: [`src/app.css`](./src/app.css)
- Question bank: [`all_questions.json`](./all_questions.json)
- Supabase schema: [`supabase_schema.sql`](./supabase_schema.sql)

## Known Limitations

- `src/App.tsx` is too large and should be split later.
- UI copy is currently English because Windows PowerShell encoding previously mangled non-ASCII strings.
- No dedicated README existed before this update.
- No automated tests yet.

## Recommended Next Steps

1. Split `src/App.tsx` into smaller components and utility modules.
2. Restore Chinese UI copy carefully, using UTF-8-safe editing only.
3. Add `.env.local` and connect Supabase for real cloud sync.
4. Deploy the app after verifying auth redirect URLs.
5. Add the second-phase features:
   - management page
   - AI batch import

## Git / SSH Reminder

This machine has both company and personal GitHub accounts.

For this repo, the working SSH remote is:

```bash
git@github-personal:etStart/interview-flashcards.git
```

The SSH alias comes from `~/.ssh/config`:

```sshconfig
Host github-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
```

If push suddenly fails again, test this first:

```bash
ssh -T git@github-personal
```
