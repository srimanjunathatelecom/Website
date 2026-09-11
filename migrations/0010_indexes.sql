-- Index the foreign keys the site actually reads on every page.
--
-- None of these existed. On a development database with a few dozen rows that
-- is invisible, because Postgres sequentially scans a small table faster than
-- it walks an index — which is exactly why this survived so long. At real
-- volume the same queries become full table scans: a customer opening their
-- account page reads every order the shop has ever taken, and a product page
-- reads every image, variant, review and question in the catalogue to find the
-- handful belonging to that one product.
--
-- IF NOT EXISTS throughout so this is safe to re-run, and additive only: no
-- column, constraint or row is touched.
--
-- CONCURRENTLY is deliberately not used. These tables are small enough today
-- that the brief lock is nothing, and CONCURRENTLY cannot run inside the
-- transaction a migration runner wraps around this file. If this is applied to
-- a large live database later, run the statements individually with
-- CREATE INDEX CONCURRENTLY instead.

-- Order history. The admin list pulls up to 300 orders and then fetches their
-- items in one IN (...) — without this that second query scans the whole
-- order_items table.
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);
-- The admin list is ordered by newest first and filtered by status; the
-- composite covers both that sort and the common "show me everything Placed"
-- query.
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at DESC);
-- Coupon redemption counts are derived from orders.coupon_code rather than a
-- counter column, so that count runs on every checkout that applies a code.
CREATE INDEX IF NOT EXISTS orders_coupon_code_idx ON orders (coupon_code);

-- Product detail pages. Every one of these reads is scoped to a single
-- product, and every one of them was scanning the whole table.
CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images (product_id);
CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON reviews (product_id);
CREATE INDEX IF NOT EXISTS product_questions_product_id_idx ON product_questions (product_id);
CREATE INDEX IF NOT EXISTS stock_history_product_id_idx ON stock_history (product_id);

-- Listing pages filter on these constantly.
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products (category_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON products (status);

-- Per-customer reads on the account page and in the header.
CREATE INDEX IF NOT EXISTS wishlist_customer_id_idx ON wishlist (customer_id);
CREATE INDEX IF NOT EXISTS addresses_customer_id_idx ON addresses (customer_id);

-- The unread-notification badge is rendered on every admin page load, so this
-- query runs more often than almost anything else in the app. Partial, because
-- read notifications are the overwhelming majority over time and there is no
-- reason to index rows the query never wants.
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (created_at DESC) WHERE read = false;

-- Session lookup already runs on the primary key (the token is the id), so it
-- needs nothing. Expired-session cleanup does scan by date.
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
