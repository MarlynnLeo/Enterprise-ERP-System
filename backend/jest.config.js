module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js'
    ],

    // Coverage collection
    collectCoverageFrom: [
        'src/services/**/*.js',
        '!src/services/business/**',
        '!**/node_modules/**'
    ],

    // Coverage output directory
    coverageDirectory: 'coverage',

    // Module path resolution
    moduleDirectories: ['node_modules', 'src'],

    // Per-test timeout in milliseconds
    testTimeout: 10000,

    // Ignored test paths
    testPathIgnorePatterns: ['/node_modules/'],

    // Release database/Redis resources after each test environment finishes.
    setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],

    // Reset mocks between test files.
    clearMocks: true,
    restoreMocks: true
};
