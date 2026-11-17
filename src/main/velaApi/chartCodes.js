/** Chart list storage client — port of Vela/pc-app/src/chartCodesApi.ts. */

class ChartCodesApi {
  constructor(connector) {
    this.connector = connector;
  }

  list() {
    return this.connector.apiFetch('/api/chart-codes');
  }

  get(id) {
    return this.connector.apiFetch(`/api/chart-codes?id=${id}`);
  }

  create(title, mmd_code = '', product_id) {
    return this.connector.apiFetch('/api/chart-codes', {
      method: 'POST',
      body: JSON.stringify({ title, mmd_code, product_id }),
    });
  }

  update(id, changes) {
    return this.connector.apiFetch(`/api/chart-codes?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  }

  delete(id) {
    return this.connector.apiFetch(`/api/chart-codes?id=${id}`, { method: 'DELETE' });
  }

  listProducts() {
    return this.connector.apiFetch('/api/products');
  }
}

module.exports = { ChartCodesApi };
