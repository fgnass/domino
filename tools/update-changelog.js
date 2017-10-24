#!/usr/bin/node
var fs = require('fs');
var path = require('path');
var version = require('../package.json').version;

var CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

var changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');


if (/\+git$/.test(version)) {
    changelog = '# domino x.x.x (not yet released)\n\n' + changelog;
} else {
    changelog = changelog.replace(/^# domino x\.x\.x.*$/m, function() {
        var today = new Date();
        var fmt = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(today);
        return '# domino ' + version + ' (' + fmt + ')';
    });
}

fs.writeFileSync(CHANGELOG_PATH, changelog, 'utf8');
