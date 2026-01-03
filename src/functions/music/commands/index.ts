export { default as autoplay } from './autoplay'
export { default as recommendation } from './recommendation'

// Add other music commands here as needed
// export { default as play } from "./play"
// export { default as pause } from "./pause"
// export { default as skip } from "./skip"
// export { default as stop } from "./stop"
// export { default as queue } from "./queue"
// export { default as volume } from "./volume"

// Default export function
export default async function musicCommands(): Promise<unknown[]> {
    const { autoplay, recommendation } = await import('./index')
    return [autoplay, recommendation]
}
