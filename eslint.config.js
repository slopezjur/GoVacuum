/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        ignores: ['node_modules/**', 'tests/__pycache__/**']
    },
    {
        files: ['js/**/*.js', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                document: 'readonly',
                window: 'readonly',
                requestAnimationFrame: 'readonly',
                performance: 'readonly',
                console: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'eqeqeq': ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'curly': ['error', 'all']
        }
    }
];
