function paginate({ page, limit }) {
  return { skip: (page - 1) * limit, limit };
}

function pageMeta(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = { paginate, pageMeta };
