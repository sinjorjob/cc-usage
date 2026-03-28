/**
 * data-provider.js - Context data provider interface
 */
class ContextDataProvider {
  async fetch() {
    throw new Error('Not implemented');
  }
}

module.exports = { ContextDataProvider };
