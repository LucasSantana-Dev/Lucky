declare module "../../../utils/log" {
    export function errorLog(params: { message: string; error: unknown }): void
    export function successLog(params: { message: string }): void
}
