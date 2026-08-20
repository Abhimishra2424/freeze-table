import babel from '@rollup/plugin-babel';

// src/ is ESM inside a package with no `"type": "module"`, so Node cannot import it
// directly — the unit tests are bundled to CommonJS first and then run with plain
// `node`. Nothing here is published; it exists only for `npm run test:unit`.
export default {
  input: 'scripts/unit.js',
  output: { file: 'scripts/.unit.build.cjs', format: 'cjs', exports: 'auto' },
  plugins: [babel({ babelHelpers: 'bundled', extensions: ['.js'], exclude: 'node_modules/**' })],
};
