#!/usr/bin/node
var fs = require('fs');
var path = require('path');
var PACKAGEPATH = path.join(__dirname, '..', 'package.json');

var package = require(PACKAGEPATH);
if (!/\+git$/.test(package.version)) {
    package.version += '+git';
    fs.writeFileSync(PACKAGEPATH, JSON.stringify(package, null, 2)+'\n', 'utf8');
}
