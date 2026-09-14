-- Controle Simples — integrity rules for aggregate modes.
-- One active monthly total per organization/competency and one active daily total per date.

create unique index if not exists financial_entries_simple_monthly_uq
  on public.financial_entries(organization_id, competency)
  where type = 'revenue' and mode = 'monthly' and entry_status = 'active';

create unique index if not exists financial_entries_simple_daily_uq
  on public.financial_entries(organization_id, occurred_on)
  where type = 'revenue' and mode = 'daily' and entry_status = 'active';
