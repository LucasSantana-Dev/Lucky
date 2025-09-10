module.exports = {
  // Ignore specific packages that are used but not detected by depcheck
  ignores: [
    // Build tools and cross-platform utilities
    "cross-env",
    
    // Commit linting tools
    "@commitlint/cli",
    "@commitlint/config-conventional",
    
    // YouTube library (used dynamically)
    "youtubei.js",
    
    // TypeScript and build tools that might be used in configs
    "typescript",
    "tsup",
    "tsx",
    
    // Testing framework
    "jest",
    
    // Development tools
    "prettier",
    "eslint",
    "husky",
    "lint-staged",
    "commitizen",
    "cz-conventional-changelog",
    
    // ESLint related packages (used in configs)
    "@eslint/js",
    "@typescript-eslint/eslint-plugin",
    "@typescript-eslint/parser",
    "eslint-config-prettier",
    "globals",
    
    // Depcheck itself
    "depcheck",
    
    // Core Discord bot dependencies (used dynamically or in runtime)
    "@discordjs/builders",
    "@opentelemetry/api",
    "@sentry/node",
    "@sentry/profiling-node",
    "chalk",
    "discord-player",
    "discord-player-youtubei",
    "discord.js",
    "dotenv",
    "ffmpeg-static",
    "fluent-ffmpeg",
    "module-alias",
    "play-dl",
    
    // Type definitions
    "@types/fluent-ffmpeg",
    "@types/node"
  ],
  
  // Skip checking certain directories
  skipMissing: false,
  
  // Ignore patterns for files
  ignorePatterns: [
    "dist/**",
    "node_modules/**",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
    "*.config.ts",
    "scripts/**",
    "docs/**",
    "*.md"
  ],
  
  // Ignore specific dependency patterns
  ignoreMatches: [
    // Ignore dev dependencies that might be used in build processes
    "@types/*",
    "eslint-*",
    "prettier-*",
    "jest-*",
    "ts-*"
  ],
  
  // Ignore bin dependencies
  ignoreBinPackage: false,
  
  // Ignore dependencies that are only used in specific file patterns
  specials: [
    // ESLint plugins and configs
    "eslint-plugin-*",
    "eslint-config-*",
    
    // TypeScript related
    "@typescript-eslint/*",
    
    // Build tools
    "tsup",
    "tsx",
    "cross-env"
  ],
  
  // Ignore missing dependencies (false positives from TypeScript path aliases)
  ignoreDirs: [
    "src/**"
  ]
};
