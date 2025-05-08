import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/functions/download/commands/*.ts',
    'src/functions/general/commands/*.ts',
    'src/functions/music/commands/*.ts'
  ],
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: false,
  treeshake: false,
  outExtension: () => ({ js: '.js' }),
  esbuildOptions(options) {
    options.plugins = [
      ...(options.plugins || []),
      {
        name: 'add-js-extension',
        setup(build) {
          build.onResolve({ filter: /^[.][.][/].*[^.](?![.]js)$/ }, args => {
            if (!args.path.endsWith('.js')) {
              return {
                path: args.path + '.js',
                external: false,
              };
            }
          });
        },
      },
    ];
  },
});