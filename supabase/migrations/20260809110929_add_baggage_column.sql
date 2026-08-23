/*
# Add baggage column to trips

1. Modified Tables
- `trips`
  - `baggage` (text, nullable) — baggage size info, primarily for passengers (e.g. "Mažas", "Didelis", "Nėra")
2. Security
- No policy changes — existing UPDATE/INSERT policies already cover the new column.
*/

ALTER TABLE trips ADD COLUMN IF NOT EXISTS baggage text;
