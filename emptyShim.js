// Shim for Node.js built-in modules when bundling for React Native
module.exports = {
  DatabaseSync: class MockDatabaseSync {
    constructor() {}
    exec() {}
    close() {}
    prepare() {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        all: () => []
      };
    }
  }
};
