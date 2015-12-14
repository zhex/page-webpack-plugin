var path = require('path');
var glob = require('glob');
var fs = require('fs');

function AssetReplacePlugin(opts) {
	this.opts = opts;
}

AssetReplacePlugin.prototype.apply = function (compiler) {
	compiler.plugin('after-emit', function (compilation, callback) {
		var stats  = compilation.getStats().toJson();
		var assets = getAssets(stats);
		var files = glob.sync(this.opts.files, {cwd: this.opts.cwd});

		files.forEach(function (file) {
			var content = fs.readFileSync(file).toString();

			Object.keys(assets).forEach(function (key) {
				var regx = new RegExp(key, 'g');
				content = content.replace(regx, assets[key]);
			});

			fs.writeFileSync(path.join('./dist', file.replace(this.opts.cwd, '')), content);
		}.bind(this));

		callback();
	}.bind(this));
};

module.exports = AssetReplacePlugin;

function getAssets(stats) {
	var assets = {};
	var assetsByChunkName = stats.assetsByChunkName;

	Object.keys(assetsByChunkName).forEach(function (key) {
		var chunks = assetsByChunkName[key];

		if (!Array.isArray(chunks)) chunks = [chunks];

		chunks.forEach(function (chunk) {
			assets[key + path.extname(chunk)] = chunk;
		});
	});

	return assets;
}
