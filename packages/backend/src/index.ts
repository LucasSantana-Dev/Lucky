import { errorLog } from '@lucky/shared/utils'
import { bootstrapBackend } from './bootstrap'

async function main(): Promise<void> {
    await bootstrapBackend()
}

main().catch((err: unknown) => {
    errorLog({
        message: 'Failed to start backend:',
        error: err,
    })
    process.exit(1)
})
