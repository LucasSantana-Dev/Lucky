// Bot lint entry point (#1621). Reuses the root flat config as the single
// source of truth for rules, including the #1357 ratchet block that is pinned
// to packages/{bot,shared}/src via basePath. discord.js is a library and adds
// no runtime globals, so the root Node globals suffice. Append extra blocks
// below for bot-specific overrides.
import baseConfig from "../../eslint.config.js"

export default baseConfig
