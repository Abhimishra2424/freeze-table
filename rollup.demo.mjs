import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { nodeResolve } from '@rollup/plugin-node-resolve';

// Standalone demo bundle: React, react-table and the library are all bundled in, so
// example/index.html opens straight from the filesystem with no server or CDN.
export default {
  input: 'example/demo.jsx',
  output: { file: 'example/demo.bundle.js', format: 'iife', sourcemap: false },
  plugins: [
    replace({ preventAssignment: true, 'process.env.NODE_ENV': JSON.stringify('production') }),
    nodeResolve({ extensions: ['.js', '.jsx'], browser: true }),
    commonjs({ include: /node_modules/ }),
    babel({ babelHelpers: 'bundled', extensions: ['.js', '.jsx'], exclude: 'node_modules/**' }),
  ],
};
