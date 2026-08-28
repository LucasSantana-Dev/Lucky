import chalk from 'chalk'
import {
    addBreadcrumb,
    captureException,
    captureMessage,
    logToSentry,
} from '../../monitoring'
import { recordWithCooldown, emitAlert } from '../../alerts'
import { getLogContext } from './context'
import { LEVEL_TOKEN } from './types'
import type { LogLevelType, LogParams, LogConfig } from './types'

// LogLevelType -> nivel do Sentry. SUCCESS nao existe la e cai em info.
const SENTRY_LOG_LEVEL: Record<number, 'debug' | 'info' | 'warn' | 'error'> = {
    0: 'error',
    1: 'warn',
    2: 'info',
    3: 'info',
    4: 'debug',
}

// Atributo de log tem que ser um mapa plano. `data` pode ser qualquer coisa (array,
// string, null), entao o que nao for objeto simples entra sob uma chave, em vez de ser
// espalhado ou descartado em silencio.
function asLogAttributes(
    params: LogParams,
): Record<string, unknown> | undefined {
    const attrs: Record<string, unknown> = {}
    if (params.correlationId) attrs.correlationId = params.correlationId
    if (params.data !== undefined) {
        const d = params.data
        if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
            Object.assign(attrs, d as Record<string, unknown>)
        } else {
            attrs.data = d
        }
    }
    return Object.keys(attrs).length > 0 ? attrs : undefined
}

function sanitizeForLogging(text: string): string {
    return text.replace(/[\x00-\x1f\x7f]/g, ' ')
}

// Last-resort coercion. String() itself throws on a null-prototype object with
// no toPrimitive, so the fallback needed its own fallback: a placeholder is
// always better than a log call that crashes the caller.
function toDisplayString(value: unknown): string {
    try {
        return String(value)
    } catch {
        return '[unserializable]'
    }
}

// Deliberately does NOT sanitize: prefixLines sanitizes each line AFTER
// splitting, and sanitizing here first would turn every newline inside the
// stack into a space, collapsing the frames into one blob that no per-line
// parser can read. One sanitizer, at the choke point, after the split.
/**
 * A V8 stack frame line. The leading whitespace is REQUIRED, and that is the
 * whole trick: the engine indents every frame and never indents the header, so
 * indentation is what separates them. Allowing zero indentation let a header
 * masquerade as a frame whenever the name or message happened to start with
 * "at ", which cost several rounds of special-casing.
 */
const FRAME_LINE = /^\s+at\s/

function serializeError(err: unknown): string {
    try {
        // Inside the try: an Error can expose a throwing getter for name,
        // message or stack, and reading one outside would crash the log call
        // instead of falling back.
        if (err instanceof Error) {
            // name and message are VALUES: a newline in either would forge an
            // extra physical log record once prefixLines splits. The stack's
            // newlines are STRUCTURE (one per frame) and must survive.
            // Read each property EXACTLY once. A mutable getter that returns
            // different values across reads would otherwise let the header be
            // built from one string while the stack is stripped with another,
            // leaving the injected text in place. Reproduced: 3 reads of
            // message, and a getter changing on the third let a frame-shaped
            // line through.
            const rawName = err.name
            const rawMessage = err.message
            const rawStack = err.stack ?? ''

            // name and message are VALUES: a newline in either would forge an
            // extra physical log record once prefixLines splits. The stack's
            // newlines are STRUCTURE (one per frame) and must survive.
            const header = `${sanitizeForLogging(rawName)}: ${sanitizeForLogging(rawMessage)}`
            // Strip the MESSAGE, not a reconstructed header. The engine embeds
            // it verbatim in the stack, and that is where injected text lives,
            // so removing it closes the hole regardless of header format or of
            // err.name being reassigned after the stack was captured.
            // Strip the message only when the stack HAS a header, because
            // replace() removes the first match anywhere: with a custom stack
            // that starts straight at the frames, a message of "at " would eat
            // a real frame's prefix and the filter would drop that line.
            //
            // A header is simply a first line that is NOT indented. No
            // comparison against the name or message is needed, so the
            // frame-shaped-name and frame-shaped-message cases fall out for
            // free rather than each needing their own branch.
            const headerless = FRAME_LINE.test(rawStack.split('\n')[0] ?? '')
            const body =
                rawMessage && !headerless
                    ? rawStack.replace(rawMessage, '')
                    : rawStack
            const frames = body
                .split('\n')
                .filter((line) => FRAME_LINE.test(line))
                .map((line) => sanitizeForLogging(line))
            return frames.length > 0
                ? `${header}\n${frames.join('\n')}`
                : header
        }
        // Same undefined case as serializeData: JSON.stringify returns
        // undefined, not a string, for functions, symbols and objects whose
        // toJSON() returns undefined.
        return JSON.stringify(err, null, 2) ?? toDisplayString(err)
    } catch {
        return toDisplayString(err)
    }
}

/**
 * Prefixes EVERY physical line, not just the first.
 *
 * serializeError emits `name: message\n<stack>` and serializeData uses
 * JSON.stringify(..., 2), so both are routinely multi-line. Prefixing only the
 * first line leaves every stack frame and every JSON continuation without the
 * level token, which is exactly what an anchored per-line shipper parser drops.
 * That would defeat the point of writing the level as a parseable token.
 */
function prefixLines(
    token: string,
    value: string,
    color: (s: string) => string,
): string {
    const lines = value.split('\n')
    // serializeError ends with the stack, which is empty when an Error carries
    // none — that leaves a trailing '' segment that would emit a bare
    // "[ERROR] " line with nothing after it.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    // Order matters: sanitise the RAW line, then colour it. Colouring first and
    // sanitising after would strip the ANSI escapes, since \x1b is a control
    // character. Sanitising here rather than at each caller keeps it a single
    // choke point no caller can forget, and keeps the taint path visible.
    return lines
        .map((line) => token + color(sanitizeForLogging(line)))
        .join('\n')
}

function serializeData(data: unknown): string {
    try {
        // JSON.stringify returns undefined (not a string) for functions,
        // symbols, and objects whose toJSON() returns undefined. Those are all
        // truthy, so the caller's guard lets them through and prefixLines would
        // then call .split on undefined and throw.
        return JSON.stringify(data, null, 2) ?? toDisplayString(data)
    } catch {
        return toDisplayString(data)
    }
}

function toError(err: unknown): Error {
    if (err instanceof Error) return err
    if (typeof err === 'string') return new Error(err)
    // Last JSON.stringify in this file without a guard. It throws on a circular
    // value or a throwing toJSON(), which would make service.error() throw
    // AFTER it had already logged — reusing the serializer keeps the whole
    // error path on the same fallback.
    return new Error(serializeData(err))
}

/**
 * Log service
 */
export class LogService {
    private readonly config: LogConfig = {
        level: 4, // DEBUG
        enableColors: true,
        enableTimestamp: true,
        enableCorrelationId: true,
    }

    setLogLevel(level: LogLevelType): void {
        this.config.level = level
    }

    private shouldLog(level: LogLevelType): boolean {
        return level <= this.config.level
    }

    private formatMessage(params: LogParams): string {
        const { message, correlationId } = params
        let formattedMessage = message

        if (this.config.enableTimestamp) {
            const timestamp = new Date().toISOString()
            formattedMessage = `[${timestamp}] ${formattedMessage}`
        }

        if (this.config.enableCorrelationId && correlationId) {
            formattedMessage = `[${correlationId}] ${formattedMessage}`
        }

        // Prepended last so the level is always at index 0, whatever the
        // timestamp/correlationId flags are set to. A shipper can then anchor
        // on `^\[LEVEL\]` instead of scanning the line for a keyword, which
        // is what let message *content* forge a level (#2054).

        return formattedMessage
    }

    private getColor(level: LogLevelType): (text: string) => string {
        if (!this.config.enableColors) {
            return (text: string) => text
        }

        switch (level) {
            case 0: // ERROR
                return chalk.red
            case 1: // WARN
                return chalk.yellow
            case 2: // INFO
                return chalk.blue
            case 3: // SUCCESS
                return chalk.green
            case 4: // DEBUG
                return chalk.gray
            default:
                return (text: string) => text
        }
    }

    private log(level: LogLevelType, params: LogParams): void {
        if (!this.shouldLog(level)) return

        const ctx = getLogContext()
        const isPlainObject = (v: unknown): v is Record<string, unknown> => {
            if (v === null || typeof v !== 'object' || Array.isArray(v))
                return false
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const proto = Object.getPrototypeOf(v)
            return proto === Object.prototype || proto === null
        }
        const effectiveParams: LogParams = ctx
            ? {
                  ...params,
                  correlationId: params.correlationId ?? ctx.correlationId,
                  data: isPlainObject(params.data)
                      ? { ...(ctx as Record<string, unknown>), ...params.data }
                      : (params.data ?? ctx),
              }
            : params

        const formattedMessage = this.formatMessage(effectiveParams)
        const color = this.getColor(level)

        // The token sits OUTSIDE the colour wrapper. chalk wraps whatever it
        // is given in ANSI escapes, so a token inside it would make the line
        // start with \x1b[33m rather than [WARN] and defeat an anchored
        // shipper regex entirely. An out-of-range level is a programming
        // error, not a severity, so it falls back to INFO rather than
        // emitting `[undefined]`.
        const token = `[${LEVEL_TOKEN[level] ?? 'INFO'}] `

        // Strip control characters (CR/LF/etc.) so user-provided values in the
        // message can't forge additional log lines (log injection).

        // The message is single-line by contract, so sanitise it BEFORE the
        // split: a newline from user input would otherwise become a second
        // physical record. Only stacks are legitimately multi-line.
        console.log(
            prefixLines(token, sanitizeForLogging(formattedMessage), color),
        )

        if (effectiveParams.data) {
            console.log(
                prefixLines(token, serializeData(effectiveParams.data), color),
            )
        }

        if (effectiveParams.error) {
            console.error(
                prefixLines(
                    token,
                    serializeError(effectiveParams.error),
                    color,
                ),
            )
        }

        // Um ponto so de saida para o Sentry, em vez de os ~1160 call sites conhecerem o
        // SDK. Fica DEPOIS do `shouldLog`, entao o nivel configurado continua mandando: se
        // debug esta desligado em producao, ele nao viaja.
        //
        // A mensagem vai sanitizada, pelo mesmo motivo do console: valor vindo do usuario
        // nao pode forjar registro. SUCCESS (3) entra como info porque o Sentry nao tem
        // esse nivel, e inventar um seria pior que mapear no mais proximo.
        logToSentry(
            SENTRY_LOG_LEVEL[level] ?? 'info',
            sanitizeForLogging(formattedMessage),
            asLogAttributes(effectiveParams),
        )
    }

    error(params: LogParams): void {
        this.log(0, params)

        const extras: Record<string, unknown> = { message: params.message }
        if (params.data) extras.data = params.data

        if (params.error) {
            captureException(toError(params.error), extras)
        } else {
            captureMessage(params.message, 'error', extras)
        }

        addBreadcrumb('error', params.message, 'error')

        if (recordWithCooldown('error-rate', 60_000, 10, 5 * 60_000)) {
            void emitAlert({
                title: '🚨 Error-rate spike',
                description: '10+ errors in 60 seconds',
                color: 'danger',
            })
        }
    }

    warn(params: LogParams): void {
        this.log(1, params)

        addBreadcrumb('warning', params.message, 'warning')
    }

    info(params: LogParams): void {
        this.log(2, params)

        addBreadcrumb('info', params.message, 'info')
    }

    success(params: LogParams): void {
        this.log(3, params)

        addBreadcrumb('info', params.message, 'info')
    }

    debug(params: LogParams): void {
        this.log(4, params)

        addBreadcrumb('debug', params.message, 'debug')
    }
}
