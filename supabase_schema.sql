create table if not exists public.user_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  level smallint not null default 0 check (level between 0 and 7),
  last_review_at timestamptz null,
  next_review_at timestamptz null,
  edited_answer text null,
  is_hidden boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, card_id)
);

alter table public.user_progress
  add column if not exists is_hidden boolean not null default false;

create index if not exists user_progress_next_review_idx
  on public.user_progress (user_id, next_review_at);

alter table public.user_progress enable row level security;

drop policy if exists "Users can read own progress" on public.user_progress;
create policy "Users can read own progress"
  on public.user_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress" on public.user_progress;
create policy "Users can insert own progress"
  on public.user_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on public.user_progress;
create policy "Users can update own progress"
  on public.user_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own progress" on public.user_progress;
create policy "Users can delete own progress"
  on public.user_progress
  for delete
  to authenticated
  using (auth.uid() = user_id);
