import path from 'node:path';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

// `react-table` v7 is BUNDLED rather than left as a peer dependency. Two reasons:
// it only ships CommonJS/UMD builds, and its (frozen, archived) peer range stops at
// React 18 — so on a React 19 app npm refuses to install it and the consumer's build
// dies with "Can't resolve 'react-table'". Bundling makes `npm i freeze-table` enough.
// The production build is the one included: this package never surfaces react-table's
// own development warnings, since callers do not talk to it directly.
const reactTableEntry = path.resolve('node_modules/react-table/dist/react-table.production.min.js');
const useReactTableProdBuild = {
  name: 'react-table-prod-build',
  resolveId: (source) => (source === 'react-table' ? reactTableEntry : null),
};

const banner = `/*!
 * freeze-table — https://github.com/Abhimishra2424/freeze-table
 * Released under the MIT License.
 *
 * Bundles react-table v7 (https://github.com/TanStack/table/tree/v7)
 * MIT License, Copyright (c) 2016 Tanner Linsley
 */`;

export default {
  input: 'src/index.js',
  external: [/^react($|\/)/],
  output: [
    { file: 'dist/freeze-table.cjs.js', format: 'cjs', exports: 'named', sourcemap: true, interop: 'auto', banner },
    { file: 'dist/freeze-table.esm.js', format: 'es', sourcemap: true, banner },
  ],
  plugins: [
    useReactTableProdBuild,
    nodeResolve({ extensions: ['.js', '.jsx'] }),
    commonjs({ include: /node_modules/ }),
    babel({ babelHelpers: 'bundled', extensions: ['.js', '.jsx'], exclude: 'node_modules/**' }),
  ],
};
