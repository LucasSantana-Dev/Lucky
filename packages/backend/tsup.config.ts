import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    noExternal: [],
    external: [
        '@lucky/shared',
        'ioredis',
        'connect-redis',
        'express-session',
        'express',
        'cors',
        'cookie-parser',
        'express-rate-limit',
        'session-file-store',
    ],
})
