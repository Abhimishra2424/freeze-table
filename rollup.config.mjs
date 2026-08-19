import babel from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const external = [/^react($|\/)/, /^react-table($|\/)/];

export default {
  input: 'src/index.js',
  external,
  output: [
    { file: 'dist/freeze-table.cjs.js', format: 'cjs', exports: 'named', sourcemap: true, interop: 'auto' },
    { file: 'dist/freeze-table.esm.js', format: 'es', sourcemap: true },
  ],
  plugins: [
    nodeResolve({ extensions: ['.js', '.jsx'] }),
    babel({ babelHelpers: 'bundled', extensions: ['.js', '.jsx'], exclude: 'node_modules/**' }),
  ],
};
