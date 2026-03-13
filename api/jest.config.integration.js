/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Run before any test module is imported (sets env vars for config.ts)
  setupFiles: ['<rootDir>/tests/integration/jest.setup.ts'],
  testTimeout: 30000,
  // Serial execution prevents concurrent table-truncation races on the shared test DB
  runInBand: true,
};
