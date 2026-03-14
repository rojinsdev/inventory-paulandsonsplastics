/**
 * Standardizes pagination logic for Supabase queries.
 * @param page The 1-indexed page number
 * @param size The number of items per page
 * @returns An object with 'from' and 'to' indices for .range()
 */
export const getPagination = (page: number = 1, size: number = 10) => {
    const limit = size ? +size : 10;
    const from = page ? (page - 1) * limit : 0;
    const to = page ? from + limit - 1 : limit - 1;

    return { from, to };
};
