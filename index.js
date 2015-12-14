var path = require('path');
var fs = require('fs');
var vm = require('vm');
var glob = require('glob');
var Promise = require('bluebird');

var webpack = require('webpack');
var NodeTemplatePlugin = require('webpack/lib/node/NodeTemplatePlugin');
var NodeTargetPlugin = require('webpack/lib/node/NodeTargetPlugin');
var LoaderTargetPlugin = require('webpack/lib/LoaderTargetPlugin');
var LibraryTemplatePlugin = require('webpack/lib/LibraryTemplatePlugin');
var SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');

function PagePlugin(opts) {
    this.opts = opts;
}

PagePlugin.prototype.apply = function(compiler) {
	var self = this;
    this.context = compiler.context;
    this.resultArray;

    compiler.plugin('make', function(compilation, callback) {
        var files = glob.sync(this.opts.files, { cwd: this.opts.cwd });

        files = files.map(function(file) {
            var filePath = path.join(this.opts.cwd, file);
        	return this.compilePage(filePath, file, compilation);
        }.bind(this));

        Promise.all(files)
        	.then(function (result) {
        		result.forEach(function (item) {
					var html = self.execPage(compilation, item.asset);
					compilation.assets[item.filename] = self.buildAsset(html);
				})
        	})
        	.catch(function (err) { return new Error(err) } )
        	.finally(callback);
    }.bind(this));
};

PagePlugin.prototype.getCompilerName = function(filePath) {
    var relativePath = path.relative(this.context, filePath);
    return 'page-webpack-plugin for "' + (filePath.length < relativePath.length ? filePath : relativePath) + '"';
};

PagePlugin.prototype.compilePage = function(page, outputFilename, compilation) {
    var outputOptions = {
        filename: outputFilename,
        publicPath: compilation.outputOptions.publicPath
    };

	var compilerName = this.getCompilerName(page);
	var childCompiler = compilation.createChildCompiler(compilerName, outputOptions);

	childCompiler.apply(
		new NodeTemplatePlugin(outputOptions),
		new NodeTargetPlugin(),
		new LibraryTemplatePlugin('HTML_WEBPACK_PLUGIN_RESULT', 'var'),
		new SingleEntryPlugin(this.context, page),
		new LoaderTargetPlugin('node'),
		new webpack.DefinePlugin({ HTML_WEBPACK_PLUGIN: 'true'})
	);

    childCompiler.plugin('compilation', function (compilation) {
        if (compilation.cache) {
            if (!compilation.cache[compilerName]) {
                compilation.cache[compilerName] = {};
            }
            compilation.cache = compilation.cache[compilerName];
        }
    });

	return new Promise(function (resolve, reject) {
		childCompiler.runAsChild(function (err, entries, childCompilation) {
			if (childCompilation.errors && childCompilation.errors.length) {
				var errorDetails = childCompilation.errors.map(function (err) {
					return err.message + (err.error ? ':\n' + err.error : '');
				}).join('\n');

				reject('Child compilation failed:\n' + errorDetails);
			} else {
				resolve({
					filename: outputFilename,
					asset: compilation.assets[outputFilename]
				});
			}
		});
	});
};

PagePlugin.prototype.execPage = function (compilation, compilationResult) {
	if(!compilationResult) {
		return Promise.reject('The child compilation didn\'t provide a result');
	}

	var newSource;
	var source = compilationResult.source();
	source = source.replace('var HTML_WEBPACK_PLUGIN_RESULT =', '');

	try {
		newSource = vm.runInThisContext(source);
	} catch (e) {
		var syntaxError = require('syntax-error')(source);
		var errorMessage = 'Template compilation failed: ' + e +
		(syntaxError ? '\n' + syntaxError + '\n\n\n' + source.split('\n').map(function(row, i) {
			return (1 + i) + '  - ' + row;
		}).join('\n') : '');
		compilation.errors.push(new Error(errorMessage));
		return Promise.reject(e);
	}

	return (typeof newSource === 'string' || typeof newSource === 'function')
		? newSource : 'error';
		// ? Promise.resolve(newSource)
		// : Promise.reject('error');
		// : Promise.reject('The loader "' + this.opts.template + '" didn\'t return html.');
};

PagePlugin.prototype.buildAsset = function (html) {
	return {
		source: function () {
			return html;
		},
		size: function () {
			return html.length;
		}
	};
};


module.exports = PagePlugin;
