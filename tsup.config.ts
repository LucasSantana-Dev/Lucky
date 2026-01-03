import { defineConfig } from "tsup"

export default defineConfig({
    entry: [
        "src/index.ts",
        "src/functions/**/*.ts",
        "src/utils/**/*.ts",
        "src/services/**/*.ts",
        "src/handlers/**/*.ts",
        "src/bot/**/*.ts",
        "src/config/**/*.ts",
        "src/types/**/*.ts",
    ],
    outDir: "dist",
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: true,
    shims: false,
    treeshake: false,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    external: [/^[^./]/], // Externalize all node_modules
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
