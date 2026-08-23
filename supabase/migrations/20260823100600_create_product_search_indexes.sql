-- General product search (this milestone's Scope/Technical Requirements:
-- "plain PostgreSQL indexes (no Elasticsearch/Algolia, per docs/TAS.md
-- §36)"). pg_trgm's GIN index supports fast `ILIKE '%term%'`/similarity
-- search on product name without a separate search service. Barcode/SKU
-- exact-match lookup is already served by the B-tree unique indexes created
-- in 20260823100100_create_products.sql — no additional index needed for
-- that path.
create extension if not exists pg_trgm;

create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
