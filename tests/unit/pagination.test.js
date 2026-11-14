const { paginate, pageMeta } = require('../../src/utils/pagination');

describe('pagination helpers', () => {
  it('computes skip from page and limit', () => {
    expect(paginate({ page: 3, limit: 20 })).toEqual({ skip: 40, limit: 20 });
  });

  it('builds page metadata', () => {
    expect(pageMeta(45, 2, 20)).toEqual({
      page: 2, limit: 20, total: 45, totalPages: 3, hasNextPage: true, hasPrevPage: true,
    });
    expect(pageMeta(0, 1, 20).totalPages).toBe(1);
  });
});
