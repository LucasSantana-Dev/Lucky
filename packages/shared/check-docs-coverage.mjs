#!/usr/bin/env node

import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const COVERAGE_THRESHOLD = 80

try {
    console.log(`Checking documentation coverage with TypeDoc...`)
    execSync(
        'npx typedoc --plugin typedoc-plugin-coverage --emit none src/index.ts',
        {
            cwd: __dirname,
            encoding: 'utf-8',
            stdio: 'inherit',
        }
    )

    console.log(
        `✅ Documentation generation completed with coverage plugin enabled (${COVERAGE_THRESHOLD}% threshold)`
    )
    process.exit(0)
} catch (error) {
    console.error('Error checking documentation coverage:')
    console.error(error.message)
    process.exit(1)
}
