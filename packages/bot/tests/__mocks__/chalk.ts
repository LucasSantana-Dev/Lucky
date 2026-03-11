type ChalkLike = ((...args: unknown[]) => string) & {
    red: (...args: unknown[]) => string
    yellow: (...args: unknown[]) => string
    blue: (...args: unknown[]) => string
    green: (...args: unknown[]) => string
    gray: (...args: unknown[]) => string
    white: (...args: unknown[]) => string
    bold: ChalkLike
    dim: ChalkLike
    italic: ChalkLike
}

function passthrough(...args: unknown[]): string {
    const [value] = args

    if (value === null || value === undefined) {
        return ''
    }

    if (typeof value === 'object') {
        return JSON.stringify(value)
    }

    return String(value)
}

const chalk = passthrough as ChalkLike
chalk.red = passthrough
chalk.yellow = passthrough
chalk.blue = passthrough
chalk.green = passthrough
chalk.gray = passthrough
chalk.white = passthrough
chalk.bold = chalk
chalk.dim = chalk
chalk.italic = chalk

export default chalk
export const red = chalk.red
export const yellow = chalk.yellow
export const blue = chalk.blue
export const green = chalk.green
export const gray = chalk.gray
export const white = chalk.white
