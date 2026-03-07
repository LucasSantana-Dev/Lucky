module.exports = (path, options) => {
    if (path.startsWith('.') || path.startsWith('@lukbot/')) {
        const stripped = path.replace(/\.js$/, '')
        return options.defaultResolver(stripped, options)
    }
    return options.defaultResolver(path, options)
}
