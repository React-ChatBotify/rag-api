module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true, // Automatically clear mock calls and instances between every test
  testPathIgnorePatterns: ['/node_modules/', '/dist/'], // Ignore built files
  transformIgnorePatterns: [
    "/node_modules/(?!@xenova/transformers/).+\\.js$" // Re-attempting a specific pattern
  ],
  moduleNameMapper: {
    // If you have path aliases in tsconfig.json, map them here
    // Example: '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: [
    // '<rootDir>/src/test/setup.ts' // if you have a setup file
  ],
};
