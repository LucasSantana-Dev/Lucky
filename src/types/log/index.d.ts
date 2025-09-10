declare module "../../../utils/log" {
    export function errorLog(params: { message: string; error: any }): void
    export function successLog(params: { message: string }): void
}
