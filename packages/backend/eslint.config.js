// Backend lint entry point (#1621). Reuses the root flat config as the single
// source of truth for rules: its globs are cwd-relative ("src/**/*.ts",
// project "./tsconfig.json"), so they resolve to this package when lint runs
// from here. Append extra blocks below for backend-specific overrides.
import baseConfig from "../../eslint.config.js"

export default baseConfig
