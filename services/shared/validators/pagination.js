function parsePagination(query = {}) {
  return {
    limit: Math.min(Math.max(Number(query.limit) || 50, 1), 500),
    page: Math.max(Number(query.page) || 1, 1),
  };
}

module.exports = { parsePagination };

