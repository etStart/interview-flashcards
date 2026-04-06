# Progress Log

## Current State

The project is working as a Vite + React + TypeScript interview flashcard app with local-first study flow.

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
- Local/cloud persistence flow extracted into dedicated modules
- `src/App.tsx` split into smaller files (`components`, `lib`, `types`)
- Chinese UI copy restored
- Flashcard flip bug fixed on mobile/webkit-style rendering
- Simple email + password auth UI prepared for Supabase
- Supabase schema file

## Important Files

- App shell: [`src/App.tsx`](./src/App.tsx)
- UI components: [`src/components`](./src/components)
- Shared logic: [`src/lib`](./src/lib)
- Styles: [`src/app.css`](./src/app.css)
- Question bank: [`all_questions.json`](./all_questions.json)
- Supabase schema: [`supabase_schema.sql`](./supabase_schema.sql)

## Known Limitations

- Supabase is not configured yet on this machine, so account sync still shows the env setup prompt until `.env.local` is added.
- Password auth is implemented in the UI, but if Supabase keeps `Confirm email` enabled, signup will still require email confirmation.
- Mobile layout currently feels too dense/cluttered and needs a dedicated pass.
- No automated tests yet.

## Recommended Next Steps

1. Do a mobile-only UI cleanup pass first:
   - reduce vertical density
   - tighten card/header spacing
   - simplify mobile modal/layout rhythm
2. Add `.env.local` and connect Supabase on the next work session.
3. In Supabase Dashboard, disable `Confirm email` if the goal is true no-email password signup.
4. Test signup, signin, signout, and manual sync end-to-end after env setup.
5. Deploy the app after verifying the auth settings are correct.
6. Add the second-phase features:
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
