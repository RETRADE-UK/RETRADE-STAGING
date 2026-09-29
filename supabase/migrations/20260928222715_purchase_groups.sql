-- Nullable purchase identity follows the existing item ownership/RLS and revision
-- trigger. No costs, dates, existing rows or policies are rewritten.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS purchase_group_id text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS purchase_group_name text;
COMMENT ON COLUMN public.items.purchase_group_id IS 'Shared acquisition identity; each item retains its allocated cost_price and independent sale lifecycle.';
COMMENT ON COLUMN public.items.purchase_group_name IS 'Display name of the shared acquisition.';
NOTIFY pgrst, 'reload schema';
