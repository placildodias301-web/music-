# Wilsify AI — Database & Authentication

Wilsify AI uses hosted Supabase (PostgreSQL 16) for user authentication and persistent cloud synchronization of song libraries, practice logs, and AI tutor conversations.

---

## Schema Architecture

The core MVP database schema is defined in `migrations/0001_user_data.sql`:

- **Table**: `public.user_data`
  - `user_id` (`uuid`, references `auth.users.id`, primary key)
  - `library` (`jsonb`): User's saved song analyses, custom chord edits, and notes.
  - `practice_log` (`jsonb`): Practice sessions, speeds, streaks, and chord accuracy history.
  - `assistant_chats` (`jsonb`): AI tutor conversational message history.
  - `updated_at` (`timestamptz`): Last sync timestamp.

### Row-Level Security (RLS)
Strict Row-Level Security is enabled on `public.user_data`:
```sql
create policy "Users can only read and write their own data"
  on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```
Users can only access and modify their own records. No service-role key is ever required or exposed to the client.

---

## Migration Setup

1. Open your Supabase project dashboard at https://supabase.com/dashboard.
2. Navigate to **SQL Editor** -> **New Query**.
3. Copy and paste the entire contents of [`migrations/0001_user_data.sql`](./migrations/0001_user_data.sql).
4. Click **Run**.

---

## Client Synchronization
The frontend automatically syncs with Supabase when signed in (`src/lib/cloudSync.ts`). If offline or unauthenticated, the application seamlessly operates from browser `localStorage` without disruption.\n