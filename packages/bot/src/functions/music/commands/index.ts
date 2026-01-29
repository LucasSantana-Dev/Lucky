export { default as autoplay } from './autoplay'
export { default as recommendation } from './recommendation'
export { default as play } from './play'

export default async function musicCommands(): Promise<unknown[]> {
    const { autoplay, recommendation, play } = await import('./index')
    return [autoplay, recommendation, play]
}
