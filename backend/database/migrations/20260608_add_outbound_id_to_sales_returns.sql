-- Add source outbound reference for sales returns.
-- This lets returnable quantity be calculated per outbound document instead of only per order/material.

ALTER TABLE sales_returns
ADD COLUMN outbound_id INT NULL COMMENT 'Source sales outbound ID' AFTER order_id,
ADD INDEX idx_sales_returns_outbound_id (outbound_id);

UPDATE sales_returns sr
JOIN (
  SELECT order_id, MIN(id) AS outbound_id
  FROM sales_outbound
  WHERE deleted_at IS NULL
  GROUP BY order_id
) sob ON sob.order_id = sr.order_id
SET sr.outbound_id = sob.outbound_id
WHERE sr.outbound_id IS NULL
  AND sr.order_id IS NOT NULL;
