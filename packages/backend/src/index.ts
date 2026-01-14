import { loadEnvironment } from '@lukbot/shared/config'
import { setupErrorHandlers } from '@lukbot/shared/utils'
import { initializeSentry } from '@lukbot/shared/utils'
import { infoLog } from '@lukbot/shared/utils'
import { startWebApp } from './server'

loadEnvironment()

setupErrorHandlers()

initializeSentry()

startWebApp()
