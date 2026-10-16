module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/tests/**/*.test.js',
    '**/tests/**/*.test.js',
  ],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 60000,
};
