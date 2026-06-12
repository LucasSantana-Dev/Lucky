import rootConfig from "../../eslint.config.js"

// Override the root config to downgrade shared-specific rules
const configWithDowngrades = rootConfig.map((config, index) => {
    // Skip the override block (last one in root config that targets packages/shared/src)
    if (index === rootConfig.length - 1) {
        return null
    }
    return config
}).filter(Boolean)

// Add shared-specific overrides for src/**/*.ts files
configWithDowngrades.push({
    files: ["src/**/*.ts"],
    rules: {
        "@typescript-eslint/no-non-null-assertion": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": "warn",
        "complexity": "warn",
        "no-duplicate-imports": "warn",
        "no-useless-escape": "warn",
        "no-undef": "warn",
        "no-useless-catch": "warn",
        "no-case-declarations": "warn",
        "no-useless-assignment": "warn",
        "no-control-regex": "warn",
        "preserve-caught-error": "warn",
    },
})

export default configWithDowngrades
