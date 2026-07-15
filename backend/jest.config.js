module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Load the isolated test database before application modules are imported.
    setupFiles: ['<rootDir>/tests/jest.env.js'],

    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js'
    ],

    // Coverage collection
    collectCoverageFrom: [
        'src/services/**/*.js',
        'src/controllers/**/*.js',
        'src/models/**/*.js',
        // 核心业务服务纳入覆盖（审计 B-P1-5）
        'src/services/business/**/*.js',
        '!**/node_modules/**'
    ],

    // Coverage output directory
    coverageDirectory: 'coverage',

    // Ratchet the measured baseline so ERP risk coverage cannot silently regress.
    coverageThreshold: {
        global: {
            statements: 15,
            branches: 8,
            functions: 15,
            lines: 15
        }
    },

    // Module path resolution
    moduleDirectories: ['node_modules', 'src'],

    // Coverage instrumentation makes the first application bootstrap materially slower
    // on Windows/CI. Keep enough headroom for integration hooks without masking hangs.
    testTimeout: 30000,

    // Ignored test paths
    testPathIgnorePatterns: ['/node_modules/'],

    // Release database/Redis resources after each test environment finishes.
    setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],

    // Reset mocks between test files.
    clearMocks: true,
    restoreMocks: true
};
