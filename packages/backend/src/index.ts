import { loadEnvironment } from '@lukbot/shared/config'
import { setupErrorHandlers, initializeSentry } from '@lukbot/shared/utils'
import { startWebApp } from './server'

loadEnvironment()

setupErrorHandlers()

initializeSentry()

startWebApp()
