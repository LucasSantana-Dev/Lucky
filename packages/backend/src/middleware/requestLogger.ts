import type { Request, Response, NextFunction } from 'express'
import { infoLog, warnLog, errorLog } from '@lucky/shared/utils'

export function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const start = Date.now()

    res.on('finish', () => {
        const duration = Date.now() - start
        const status = res.statusCode
        const method = req.method
        const url = req.originalUrl

        const logParams = {
            message: `${method} ${url} ${status} ${duration}ms`,
        }

        if (status >= 500) {
            errorLog(logParams)
        } else if (status >= 400) {
            warnLog(logParams)
        } else {
            infoLog(logParams)
        }
    })

    next()
}
