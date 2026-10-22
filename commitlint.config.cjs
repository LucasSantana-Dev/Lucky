/** @type {import('@commitlint/types').UserConfig} */
const Configuration = {
    extends: ["@commitlint/config-conventional"],
    plugins: [
        {
            rules: {
                // Prevent @mentions in subjects: release-please turns them into
                // GitHub profile links in CHANGELOG.md (#2697).
                "lucky/no-at-mention": ({ subject, scope }) => {
                    // Remove backtick-wrapped code spans first; GitHub does not
                    // expand @mentions inside code, so `@everyone` is safe.
                    const bare = [subject ?? "", scope ?? ""].join(" ").replace(/`[^`]+`/g, "")
                    return [
                        !/@\w/.test(bare),
                        "subject and scope must not contain bare @mentions; wrap in backticks: `@everyone`",
                    ]
                },
            },
        },
    ],
    rules: {
        "lucky/no-at-mention": [2, "always"],
        "type-enum": [
            2,
            "always",
            [
                "feat", // New feature
                "fix", // Bug fix
                "docs", // Documentation changes
                "style", // Code style changes (formatting, etc)
                "refactor", // Code changes that neither fix bugs nor add features
                "perf", // Performance improvements
                "test", // Adding or modifying tests
                "build", // Changes to build system or dependencies
                "ci", // Changes to CI configuration
                "chore", // Other changes that don't modify src or test files
                "revert", // Reverts a previous commit
            ],
        ],
        "type-case": [2, "always", "lower-case"],
        "type-empty": [2, "never"],
        "scope-case": [2, "always", "lower-case"],
        "subject-case": [2, "always", "lower-case"],
        "subject-empty": [2, "never"],
        "subject-full-stop": [2, "never", "."],
        "header-max-length": [2, "always", 72],
    },
}

module.exports = Configuration
