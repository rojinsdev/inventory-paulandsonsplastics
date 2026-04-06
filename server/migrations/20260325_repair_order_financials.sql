-- Sync total_amount and balance_due for orders with missing values but dispatched items
UPDATE public.sales_orders so
SET 
  subtotal = t.calc_subtotal,
  total_amount = t.calc_subtotal - COALESCE(so.discount_value, 0),
  balance_due = (t.calc_subtotal - COALESCE(so.discount_value, 0)) - COALESCE(so.amount_paid, 0),
  updated_at = now()
FROM (
  SELECT order_id, SUM(COALESCE(unit_price, 0) * quantity_shipped) as calc_subtotal
  FROM public.sales_order_items
  GROUP BY order_id
) t
WHERE so.id = t.order_id 
  AND (so.total_amount IS NULL OR so.balance_due IS NULL)
  AND t.calc_subtotal > 0;
