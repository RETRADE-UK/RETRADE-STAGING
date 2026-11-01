# Supabase migration history

This directory is intentionally flat. Supabase discovers migration files here by their timestamped filenames.

The numbered Stage 1 and Stage 2 files are production history. Once applied, they must not be moved, renamed, edited or grouped into subfolders. Add every future database change as a new migration that supersedes earlier behaviour.

Some early files are read-only audit or verification steps. They remain here because removing an existing migration can make local and remote migration histories disagree.

`20261101214612_items_purchase_paid_date.sql` was applied to staging through the Supabase migration tool on 1 November 2026; live application is pending. It adds a nullable `date` column without a default or backfill. Deploy the schema before the application version that writes this field. Read-only verification:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'items'
  AND column_name = 'purchase_paid_date';
```
