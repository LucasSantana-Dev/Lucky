import { ensureEnvironment } from '@lukbot/shared/config'
import { setupErrorHandlers, initializeSentry } from '@lukbot/shared/utils'
import { startWebApp } from './server'

async function main(): Promise<void> {
    await ensureEnvironment()
    setupErrorHandlers()
    initializeSentry()
    startWebApp()
}

main().catch((err: unknown) => {
    console.error('Failed to start backend:', err)
    process.exit(1)
})
