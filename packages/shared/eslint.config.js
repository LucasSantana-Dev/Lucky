// Shared lint entry point (#1621). Reuses the root flat config as the single
// source of truth for rules, including the #1357 ratchet block that is pinned
// to packages/{bot,shared}/src via basePath. #1619 (Sonar coverage exclusion)
// is still undecided, so shared stays aligned with the enforced setup like
// bot. Append extra blocks below for shared-specific overrides.
import baseConfig from "../../eslint.config.js"

export default baseConfig
