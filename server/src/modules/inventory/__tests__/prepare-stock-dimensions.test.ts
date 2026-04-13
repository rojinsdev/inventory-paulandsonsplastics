import {
    resolvePrepareDimensionsFromSoiRows,
    stockBalanceMatchesPrepareDimensions,
    sumQuantityMatchingPrepareDimensions,
} from '../prepare-stock-dimensions';

describe('prepare-stock-dimensions', () => {
    it('matches any cap when order cap is null', () => {
        const dims = { capId: null, innerId: 'inner-1', includeInner: true };
        expect(
            stockBalanceMatchesPrepareDimensions({ cap_id: 'cap-x', inner_id: 'inner-1' }, dims)
        ).toBe(true);
    });

    it('requires inner when includeInner and inner set', () => {
        const dims = { capId: null, innerId: 'inner-1', includeInner: true };
        expect(
            stockBalanceMatchesPrepareDimensions({ cap_id: null, inner_id: null }, dims)
        ).toBe(false);
        expect(
            stockBalanceMatchesPrepareDimensions({ cap_id: null, inner_id: 'inner-1' }, dims)
        ).toBe(true);
    });

    it('sums only matching rows', () => {
        const dims = { capId: null, innerId: 'i1', includeInner: true };
        const rows = [
            { quantity: 3, cap_id: 'c1', inner_id: null },
            { quantity: 2, cap_id: 'c1', inner_id: 'i1' },
        ];
        expect(sumQuantityMatchingPrepareDimensions(rows, dims)).toBe(2);
    });

    it('resolves include_inner from SOI', () => {
        const soi = [
            {
                order_id: 'o1',
                product_id: 'p1',
                cap_id: null,
                inner_id: 'i1',
                include_inner: true,
            },
        ];
        const dims = resolvePrepareDimensionsFromSoiRows(soi, {
            sales_order_id: 'o1',
            product_id: 'p1',
            inner_id: 'i1',
            cap_id: null,
        });
        expect(dims.includeInner).toBe(true);
        expect(dims.innerId).toBe('i1');
    });

    it('treats NULL include_inner on SOI as with-inner (default)', () => {
        const soi = [
            {
                order_id: 'o1',
                product_id: 'p1',
                cap_id: 'c1',
                inner_id: null,
                include_inner: null as boolean | null,
            },
        ];
        const dims = resolvePrepareDimensionsFromSoiRows(soi, {
            sales_order_id: 'o1',
            product_id: 'p1',
            inner_id: null,
            cap_id: 'c1',
        });
        expect(dims.includeInner).toBe(true);
    });

    it('respects explicit include_inner false on SOI', () => {
        const soi = [
            {
                order_id: 'o1',
                product_id: 'p1',
                cap_id: 'c1',
                inner_id: null,
                include_inner: false,
            },
        ];
        const dims = resolvePrepareDimensionsFromSoiRows(soi, {
            sales_order_id: 'o1',
            product_id: 'p1',
            inner_id: null,
            cap_id: 'c1',
        });
        expect(dims.includeInner).toBe(false);
    });

    it('without-inner: only matches stock rows with inner_id null', () => {
        const dims = { capId: 'c1', innerId: null, includeInner: false };
        expect(
            stockBalanceMatchesPrepareDimensions({ cap_id: 'c1', inner_id: null }, dims)
        ).toBe(true);
        expect(
            stockBalanceMatchesPrepareDimensions({ cap_id: 'c1', inner_id: 'inner-1' }, dims)
        ).toBe(false);
    });

    it('without-inner: sums only null-inner rows', () => {
        const dims = { capId: 'c1', innerId: null, includeInner: false };
        const rows = [
            { quantity: 5, cap_id: 'c1', inner_id: 'inner-1' },
            { quantity: 3, cap_id: 'c1', inner_id: null },
        ];
        expect(sumQuantityMatchingPrepareDimensions(rows, dims)).toBe(3);
    });
});
