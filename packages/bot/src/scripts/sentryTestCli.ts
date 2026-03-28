import { handleSentryTestFailure, runSentryTest } from './sentryTest'

void runSentryTest().catch(handleSentryTestFailure)
