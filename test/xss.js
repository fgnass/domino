'use strict';
var domino = require('../lib');

exports = exports.xss = {};

// Tests for HTML serialization concentrating on possible "Mutation based
// XSS vectors"; see https://cure53.de/fp170.pdf

// If we change HTML serialization such that any of these tests fail, please
// review the change very carefully for potential XSS vectors!

exports.fp170_31 = function() {
  var document = domino.createDocument(
    '<img src="test.jpg" alt="``onload=xss()" />'
  );
  // In particular, ensure alt attribute is quoted, not: ...alt=``onload=xss()
  document.body.innerHTML.should.equal(
    '<img src="test.jpg" alt="``onload=xss()">'
  );
};

exports.fp170_32 = function() {
  var document = domino.createDocument(
    '<article  xmlns="urn:img src=x onerror=xss()//">123'
  );
  // XXX check XML serialization as well, once that's implemented
  // In particular, ensure that the xmlns string isn't used as an XML prefix
  // when serializing (and, of course, that attribute value is quoted)
  document.body.innerHTML.should.equal(
    '<article xmlns="urn:img src=x onerror=xss()//">123</article>'
  );
};

exports.fp170_33 = function() {
  var document = domino.createDocument(
    '<p style="font -family:\'ar\\27\\3bx\\3aexpression\\28xss\\28\\29\\29\\3bial\'"></p>'
  );
  // Be sure domino doesn't decode the backslash escapes
  // (especially in the future if we parse the CSS values more fully)
  document.body.innerHTML.should.equal(
    '<p style="font -family:\'ar\\27\\3bx\\3aexpression\\28xss\\28\\29\\29\\3bial\'"></p>'
  );
};

exports.fp170_34 = function() {
  var document = domino.createDocument(
    '<p style="font -family:\'ar&quot;;x=expression(xss())/*ial\'"></p>'
  );
  // Be sure domino re-encodes the entities correctly
  // (especially in the future if we parse the CSS values more fully)
  document.body.innerHTML.should.equal(
    '<p style="font -family:\'ar&quot;;x=expression(xss())/*ial\'"></p>'
  );
};

exports.fp170_35 = function() {
  var document = domino.createDocument(
    '<img style="font-fa\\22onload\\3dxss\\28\\29\\20mily:\'arial\'" src="test.jpg" />'
  );
  // Again, ensure domino doesn't decode the backslash escapes
  // (especially in the future if we parse the CSS values more fully)
  document.body.innerHTML.should.equal(
    '<img style="font-fa\\22onload\\3dxss\\28\\29\\20mily:\'arial\'" src="test.jpg">'
  );
};

exports.fp170_36 = function() {
  var document = domino.createDocument(
    '<style>*{font-family:\'ar&lt;img src=&quot;test.jpg&quot; onload=&quot;xss()&quot;/&gt;ial\'}</style>'
  );
  // Ensure that HTML entities are properly encoded inside <style>
  document.head.innerHTML.should.equal(
    '<style>*{font-family:\'ar&lt;img src=&quot;test.jpg&quot; onload=&quot;xss()&quot;/&gt;ial\'}</style>'
  );
};

exports.fp170_37 = function() {
  var document = domino.createDocument(
    '<p><svg><style>*{font-family:\'&lt;&sol;style&gt;&lt;img/src=x&Tab;onerror=xss()&sol;&sol;\'}</style></svg></p>'
  );
  // Ensure that HTML entities are properly encoded inside <style>
  document.body.innerHTML.should.equal(
    '<p><svg><style>*{font-family:\'&lt;/style&gt;&lt;img/src=x\tonerror=xss()//\'}</style></svg></p>'
  );
};
