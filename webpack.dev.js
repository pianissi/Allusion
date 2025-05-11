// This file contains the development configuration for Webpack.
// Webpack is used to bundle our source code, in order to optimize which
// scripts are loaded and all required files to run the application are
// neatly put into the build directory.
// Based on https://taraksharma.com/setting-up-electron-typescript-react-webpack/

const HtmlWebpackPlugin = require('html-webpack-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

let mainConfig = {
  mode: 'development',
  entry: './src/main.ts',
  devtool: 'source-map',
  target: ['web', 'es2022'], 
	// electron-main was replaced for mobile, TODO: fix 
  output: {
    filename: 'main.bundle.js',
    path: __dirname + '/build',
    clean: true,
    // keep filename ending the same: certain filename patterns required for certain Electron icon uses
    assetModuleFilename: 'assets/[hash]_[name][ext][query]',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  resolve: {
		alias: {
			'fs-extra': false,
			// fs: path.resolve(__dirname, 'common/platform/fs'),
		},
    extensions: ['.js', '.json', '.ts'],
		fallback: {
			// assert: require.resolve('assert'),
			// buffer: require.resolve('buffer'),
			// util: require.resolve('util'),
			// path: require.resolve('path-browserify'),
			// os: require.resolve('os-browserify/browser'),
			// stream: require.resolve('stream-browserify'),
			// zlib: require.resolve('browserify-zlib'),
			// crypto: require.resolve('crypto-browserify'),
			// vm: require.resolve('vm-browserify'),
			// constants: require.resolve('constants-browserify'),
			// url: require.resolve('url'),
			// http: require.resolve('stream-http'),
			// the following must be implemented in mobile
			fs: false,
			child_process: false,
		}
  },
  module: {
    rules: [
      {
        // All files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'.
        test: /\.(ts)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
        },
      },
      {
        test: /\.(jpg|png|gif|ico|icns|eot|ttf|woff|woff2)$/,
        type: 'asset/resource',
      },
			{
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  externals: {
    fsevents: "require('fsevents')"
  },
	plugins: [
		new webpack.ProvidePlugin({
			process: 'process/browser',
		}),
		new NodePolyfillPlugin(),
  ],
};

let rendererConfig = {
  mode: 'development',
  entry: './src/renderer.tsx',
  devtool: 'source-map',
  target: ['web', 'es2022'],
	// electron-renderer was replaced for mobile, TODO: fix 
  output: {
    filename: 'renderer.bundle.js',
    path: __dirname + '/build',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  experiments: {
    asyncWebAssembly: true,
  },
  resolve: {
    extensions: ['.js', '.json', '.ts', '.tsx', '.svg', '.wasm'],
    alias: {
      common: path.resolve(__dirname, 'common/'),
      widgets: path.resolve(__dirname, 'widgets/'),
      resources: path.resolve(__dirname, 'resources/'),
      src: path.resolve(__dirname, 'src/'),
      wasm: path.resolve(__dirname, 'wasm/'),
			// fs: path.resolve(__dirname, 'common/platform/fs'),
			'fs-extra': false,
    },
		fallback: {
			// assert: require.resolve('assert'),
			// buffer: require.resolve('buffer'),
			// util: require.resolve('util'),
			// path: require.resolve('path-browserify'),
			// os: require.resolve('os-browserify/browser'),
			// stream: require.resolve('stream-browserify'),
			// zlib: require.resolve('browserify-zlib'),
			// crypto: require.resolve('crypto-browserify'),
			// vm: require.resolve('vm-browserify'),
			// constants: require.resolve('constants-browserify'),
			// url: require.resolve('url'),
			// http: require.resolve('stream-http'),
			// the following must be implemented in mobile
			fs: false,
			child_process: false,
		}
  },
  module: {
    rules: [
      {
        // All files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'.
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
      },
      {
        test: /\.(scss|css)$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } },
        ],
      },
      {
        test: /\.(jpg|png|gif|ico|icns|eot|ttf|woff|woff2)$/,
        type: 'asset/resource',
      },
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
      {
        test: /\.js$/,
        resourceQuery: /file/,
        type: 'asset/resource',
      },
			{
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.svg$/,
        oneOf: [
          {
            issuer: /\.scss$/,
            type: 'asset/resource',
          },
          {
            issuer: /.tsx?$/,
            loader: '@svgr/webpack',
          },
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, './src/index.html'),
    }),
		new webpack.ProvidePlugin({
			process: 'process/browser',
		}),
		new NodePolyfillPlugin(),
  ],
  externals: {
    fsevents: "require('fsevents')"
  }
};

module.exports = [mainConfig, rendererConfig];
