import { defineConfig } from "tsup"

export default defineConfig({
    entry: [
        "src/index.ts",
        "src/functions/download/commands/*.ts",
        "src/functions/general/commands/*.ts",
        "src/functions/music/commands/*.ts",
        "src/utils/**/*.ts",
    ],
    outDir: "dist",
    format: ["esm"],
    dts:
        process.env.NODE_ENV === "production"
            ? {
                  // Only generate DTS for main entry point to speed up builds
                  entry: ["src/index.ts"],
                  // Use faster DTS generation
                  resolve: true,
              }
            : false,
    splitting: true, // Enable code splitting for better performance
    sourcemap: process.env.NODE_ENV === "development", // Only in dev
    clean: true,
    shims: false,
    treeshake: true, // Enable tree shaking for smaller bundles
    minify: process.env.NODE_ENV === "production", // Only minify in production
    target: "es2022", // Target modern Node.js
    outExtension: () => ({ js: ".js" }),
    external: ["unfetch", "isomorphic-unfetch"], // Mark unfetch as external
    esbuildOptions(options) {
        options.plugins = [
            ...(options.plugins || []),
            {
                name: "add-js-extension",
                setup(build) {
                    build.onResolve(
                        { filter: /^[.][.][/].*[^.](?![.]js)$/ },
                        (args) => {
                            if (!args.path.endsWith(".js")) {
                                return {
                                    path: args.path + ".js",
                                    external: false,
                                }
                            }
                        },
                    )
                },
            },
        ]
    },
})
