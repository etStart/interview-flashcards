# interview-flashcards

A Vite + React + TypeScript flashcard app for interview prep.

The question bank is kept in [`all_questions.json`](./all_questions.json). Study progress is stored locally first and can sync to Supabase after env vars and the database table are configured.

## Current Scope

- Group-based navigation from the home screen
- Study sessions with SRS scoring using `level 0-7`
- Answer editing per card
- Backup export/import
- Supabase-ready cloud sync flow

## Tech Stack

- Vite
- React 19
- TypeScript
- Supabase JS client

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Supabase Setup

1. Create a Supabase project.
2. Run the SQL in [`supabase_schema.sql`](./supabase_schema.sql).
3. Create a `.env.local` file from [`.env.example`](./.env.example).
4. Fill in:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Without these env vars, the app stays in local-only mode.

## Project Structure

```text
.
├─ src/
│  ├─ App.tsx
│  ├─ app.css
│  ├─ main.tsx
│  └─ vite-env.d.ts
├─ all_questions.json
├─ supabase_schema.sql
├─ index.html
├─ package.json
└─ vite.config.ts
```

## Notes

- The current UI copy is mostly English. This was a deliberate cleanup after Windows shell encoding issues corrupted earlier non-ASCII text.
- The question bank content itself is still preserved in the original JSON source.
- The app currently keeps most logic inside [`src/App.tsx`](./src/App.tsx). Splitting it into smaller modules/components is a good next refactor.

