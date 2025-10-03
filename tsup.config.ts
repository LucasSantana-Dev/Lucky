import { defineConfig } from "tsup"

export default defineConfig({
    entry: [
        "src/index.ts",
        "src/functions/download/commands/*.ts",
        "src/functions/general/commands/*.ts",
        "src/functions/music/commands/*.ts",
        "src/utils/**/*.ts",
    ], // Bundle main entry point and all command files
    outDir: "dist",
    format: ["esm"],
    dts: false, // Disable DTS generation for faster builds
    splitting: false, // Disable code splitting
    sourcemap: false, // Disable sourcemaps for production
    clean: true,
    shims: false,
    treeshake: false, // Disable tree shaking to avoid issues
    minify: false, // Disable minification to avoid issues
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    external: [
        // Mark all node_modules as external to avoid bundling issues
        /^[^./]/, // Externalize all node_modules
    ],
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
