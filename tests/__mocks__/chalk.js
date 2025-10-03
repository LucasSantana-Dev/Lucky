// Mock chalk for Jest tests
const createChalkMock = () => {
    const methods = {
        red: (text) => text,
        green: (text) => text,
        yellow: (text) => text,
        blue: (text) => text,
        magenta: (text) => text,
        cyan: (text) => text,
        white: (text) => text,
        gray: (text) => text,
        grey: (text) => text,
        black: (text) => text,
        redBright: (text) => text,
        greenBright: (text) => text,
        yellowBright: (text) => text,
        blueBright: (text) => text,
        magentaBright: (text) => text,
        cyanBright: (text) => text,
        whiteBright: (text) => text,
        bgRed: (text) => text,
        bgGreen: (text) => text,
        bgYellow: (text) => text,
        bgBlue: (text) => text,
        bgMagenta: (text) => text,
        bgCyan: (text) => text,
        bgWhite: (text) => text,
        bgBlack: (text) => text,
        bold: (text) => text,
        dim: (text) => text,
        italic: (text) => text,
        underline: (text) => text,
        strikethrough: (text) => text,
        reset: (text) => text,
        inverse: (text) => text,
        hidden: (text) => text,
        visible: (text) => text,
    }

    // Create chainable methods
    const chainableMethods = {}
    Object.keys(methods).forEach((key) => {
        chainableMethods[key] = function (text) {
            const result = methods[key](text)
            return createChainableChalk(result)
        }
    })

    const createChainableChalk = (value) => {
        const stringValue = String(value)
        const chainable = {
            ...chainableMethods,
            toString: () => stringValue,
            valueOf: () => stringValue,
            // Add string conversion for Jest expectations
            [Symbol.toPrimitive]: () => stringValue,
            // Add string conversion for Jest stringContaining
            includes: (searchString) => stringValue.includes(searchString),
            indexOf: (searchString) => stringValue.indexOf(searchString),
            // Add string conversion for Jest stringMatching
            match: (regex) => stringValue.match(regex),
            // Add string conversion for Jest stringContaining matcher
            [Symbol.toStringTag]: "String",
        }

        // Make it behave like a string for Jest matchers
        Object.setPrototypeOf(chainable, String.prototype)
        return chainable
    }

    return createChainableChalk("")
}

const mockChalk = createChalkMock()

module.exports = mockChalk
module.exports.default = mockChalk
