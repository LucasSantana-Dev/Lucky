type ChalkFn = ((text: string) => string) & Record<string, ChalkFn>

const createChalkFn = (): ChalkFn => {
    const fn = ((text: string) => text) as ChalkFn
    const passthrough = () => fn
    fn.bold = fn
    fn.dim = fn
    fn.italic = fn
    fn.underline = fn
    fn.gray = fn
    fn.grey = fn
    fn.white = fn
    fn.black = fn
    fn.red = fn
    fn.green = fn
    fn.yellow = fn
    fn.blue = fn
    fn.magenta = fn
    fn.cyan = fn
    fn.bgRed = fn
    fn.bgGreen = fn
    fn.bgYellow = fn
    fn.bgBlue = fn
    fn.bgMagenta = fn
    fn.bgCyan = fn
    fn.bgWhite = fn
    fn.hex = passthrough as unknown as ChalkFn
    fn.rgb = passthrough as unknown as ChalkFn
    return fn
}

const chalk = createChalkFn()

export default chalk
