import type { SupabaseClient } from '@supabase/supabase-js';

/** Matches stock row filtering in public.prepare_order_items_atomic for product lines. */
export type PrepareStockDimensions = {
  capId: string | null;
  innerId: string | null;
  includeInner: boolean;
};

export function stockBalanceMatchesPrepareDimensions(
  row: { cap_id?: string | null; inner_id?: string | null },
  dims: PrepareStockDimensions
): boolean {
  const vCapId = dims.capId;
  const vInnerId = dims.innerId;
  const vIncludeInner = dims.includeInner;

    const capOk = vCapId == null || row.cap_id === vCapId;
    // Strict: without-inner lines only match stock rows with inner_id NULL (packed/bundled without inner).
    // With-inner lines match the resolved inner when set, or any inner row when inner not resolved (legacy).
    let innerOk: boolean;
    if (!vIncludeInner) {
        innerOk = row.inner_id == null;
    } else {
        innerOk = vInnerId == null || row.inner_id === vInnerId;
    }
    return capOk && innerOk;
}

export function sumQuantityMatchingPrepareDimensions<
  T extends { quantity: unknown; cap_id?: string | null; inner_id?: string | null }
>(rows: T[] | null | undefined, dims: PrepareStockDimensions): number {
  if (!rows?.length) return 0;
  return rows.reduce((sum, row) => {
    if (!stockBalanceMatchesPrepareDimensions(row, dims)) return sum;
    return sum + Number(row.quantity);
  }, 0);
}

type SoiRow = {
  order_id: string;
  product_id: string;
  inner_id: string | null;
  cap_id: string | null;
  include_inner: boolean | null;
};

/** Resolve cap/inner/include_inner from the sales line when possible (authoritative for prepare). */
export function resolvePrepareDimensionsFromSoiRows(
  soiRows: SoiRow[] | null | undefined,
  req: {
    sales_order_id?: string | null;
    product_id?: string | null;
    inner_id?: string | null;
    cap_id?: string | null;
  }
): PrepareStockDimensions {
  let capId = req.cap_id ?? null;
  let innerId = req.inner_id ?? null;
  let includeInner = false;

  if (req.sales_order_id && req.product_id && soiRows?.length) {
    const candidates = soiRows.filter(
      (s) => s.order_id === req.sales_order_id && s.product_id === req.product_id
    );
    const soi = req.inner_id
      ? candidates.find((s) => s.inner_id === req.inner_id) ?? candidates[0]
      : candidates[0];
    if (soi) {
      capId = soi.cap_id ?? capId;
      innerId = soi.inner_id ?? innerId;
      // NULL/absent on legacy rows = with inner (default); only explicit false opts out
      includeInner = soi.include_inner !== false;
    } else if (req.inner_id) {
      includeInner = true;
    }
  } else if (req.inner_id) {
    includeInner = true;
  }

  return { capId, innerId, includeInner };
}

export async function resolvePrepareDimensionsForProductionRequest(
  supabase: SupabaseClient,
  params: {
    salesOrderId: string | null | undefined;
    productId: string | null | undefined;
    requestInnerId: string | null | undefined;
    requestCapId: string | null | undefined;
  }
): Promise<PrepareStockDimensions> {
  const { salesOrderId, productId, requestInnerId, requestCapId } = params;
  const req = {
    sales_order_id: salesOrderId ?? undefined,
    product_id: productId ?? undefined,
    inner_id: requestInnerId ?? undefined,
    cap_id: requestCapId ?? undefined,
  };

  if (!salesOrderId || !productId) {
    return resolvePrepareDimensionsFromSoiRows([], req);
  }

  let q = supabase
    .from('sales_order_items')
    .select('cap_id, inner_id, include_inner, order_id, product_id')
    .eq('order_id', salesOrderId)
    .eq('product_id', productId);

  if (requestInnerId) {
    q = q.eq('inner_id', requestInnerId);
  }

  const { data: soiRows, error } = await q.limit(10);
  if (error) throw new Error(error.message);

  return resolvePrepareDimensionsFromSoiRows((soiRows ?? []) as SoiRow[], req);
}
