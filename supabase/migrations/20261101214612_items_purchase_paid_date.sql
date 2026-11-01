ALTER TABLE public.items ADD COLUMN IF NOT EXISTS purchase_paid_date date;
COMMENT ON COLUMN public.items.purchase_paid_date IS 'Verified stock acquisition payment date, independent of date_sourced. NULL means the payment date has not been verified; reports may use date_sourced as an estimate. Supplier settlements retain their own payment dates.';
NOTIFY pgrst, 'reload schema';
