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

// Tests for the "fallback raw-content element" XSS family: <noscript>,
// <iframe>, <noembed> and <noframes> put a browser's HTML tokenizer into
// RAWTEXT mode, where the *only* thing that can end the container is a
// literal end tag matching the container's own name -- comment syntax,
// processing-instruction syntax, and nested tags are all just inert text
// to that tokenizer. serializeOne() used to emit Comment and
// ProcessingInstruction node data completely unescaped (not even '>'),
// and never checked raw-content children against an enclosing fallback
// element's closing tag at all, so a DOM built from untrusted data (e.g.
// during server-side rendering, later re-parsed by a real browser) could
// break out of the container and turn trailing sibling markup into live,
// executing HTML. See https://github.com/expressjs/morgan-adjacent
// write-up in the PR description for the browser-verified PoCs this
// covers; every case below was confirmed live in Chromium via Playwright
// before and after this fix.

var FALLBACK_TAGS = ['noscript', 'iframe', 'noembed', 'noframes'];

exports.fallbackRawContentAncestorClosingTagEscapedInComment = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    var document = domino.createDocument('');
    var container = document.createElement(tag);
    var comment = document.createComment('</' + tag + '><img src=x onerror=alert(1)>');
    container.appendChild(comment);
    document.body.appendChild(container);

    var html = document.body.innerHTML;
    html.should.equal(
      '<' + tag + '><!--&lt;/' + tag + '><img src=x onerror=alert(1)>--></' + tag + '>'
    );
    html.should.not.containEql('</' + tag + '><img');
  });
};

exports.fallbackRawContentAncestorClosingTagEscapedInProcessingInstruction = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    var document = domino.createDocument('');
    var container = document.createElement(tag);
    var pi = document.createProcessingInstruction('x', '</' + tag + '><img src=x onerror=alert(1)>');
    container.appendChild(pi);
    document.body.appendChild(container);

    var html = document.body.innerHTML;
    html.should.equal(
      '<' + tag + '><?x &lt;/' + tag + '&gt;<img src=x onerror=alert(1)&gt;?></' + tag + '>'
    );
    html.should.not.containEql('</' + tag + '><img');
  });
};

exports.fallbackRawContentAncestorClosingTagEscapedInDirectTextChild = function() {
  // <noscript> is only RAWTEXT when scripting is enabled; createDocument()
  // alone doesn't set that flag, so use a Window (matches how a real,
  // scripting-enabled page -- the actual XSS-relevant case -- behaves).
  var window = domino.createWindow('', 'http://example.com/');
  var document = window.document;
  var noscript = document.createElement('noscript');
  noscript.appendChild(document.createTextNode('</noscript><img src=x onerror=alert(1)>'));
  document.body.appendChild(noscript);

  var html = document.body.innerHTML;
  html.should.equal('<noscript>&lt;/noscript><img src=x onerror=alert(1)></noscript>');
  html.should.not.containEql('</noscript><img');
};

exports.fallbackRawContentAncestorClosingTagEscapedThroughNestedRawContentElement = function() {
  // A <xmp>/<style>/<script> nested *inside* a fallback element is still
  // just inert RAWTEXT to a browser parsing the outer element -- it never
  // gets a chance to be recognized as a real <xmp> tag at all -- so its
  // own raw text content must also be checked against the *outer*
  // element's closing tag.
  FALLBACK_TAGS.forEach(function(tag) {
    var document = domino.createDocument('');
    var container = document.createElement(tag);
    var xmp = document.createElement('xmp');
    xmp.appendChild(document.createTextNode('</' + tag + '><img src=x onerror=alert(1)>'));
    container.appendChild(xmp);
    document.body.appendChild(container);

    var html = document.body.innerHTML;
    html.should.equal(
      '<' + tag + '><xmp>&lt;/' + tag + '><img src=x onerror=alert(1)></xmp></' + tag + '>'
    );
    html.should.not.containEql('</' + tag + '><img');
  });
};

exports.fallbackRawContentAncestorClosingTagEscapedAcrossTemplateBoundary = function() {
  // template.content is a DocumentFragment whose parentNode is null, so a
  // plain ancestor walk would stop there and miss an enclosing fallback
  // element outside the <template>. HTMLTemplateElement stamps a `_host`
  // back-reference onto its content fragment specifically so this walk
  // can continue upward; this test would fail (leave the ancestor tag
  // unescaped) if that link were ever dropped.
  FALLBACK_TAGS.forEach(function(tag) {
    var document = domino.createDocument('');
    var container = document.createElement(tag);
    var template = document.createElement('template');
    var comment = document.createComment('</' + tag + '><img src=x onerror=alert(1)>');
    template.content.appendChild(comment);
    container.appendChild(template);
    document.body.appendChild(container);

    var html = document.body.innerHTML;
    html.should.equal(
      '<' + tag + '><template><!--&lt;/' + tag + '><img src=x onerror=alert(1)>--></template></' + tag + '>'
    );
    html.should.not.containEql('</' + tag + '><img');
  });
};

exports.fallbackRawContentAncestorClosingTagEscapedAcrossClonedTemplateBoundary = function() {
  // cloneNode(true) on a <template> must re-link the *clone's* content
  // fragment to the *clone* (not leave it pointing at the original), or
  // the ancestor walk from content cloned into a different tree silently
  // stops at the fragment boundary again.
  var document = domino.createDocument('');
  var template = document.createElement('template');
  var comment = document.createComment('</noscript><img src=x onerror=alert(1)>');
  template.content.appendChild(comment);

  var clone = template.cloneNode(true);
  var noscript = document.createElement('noscript');
  noscript.appendChild(clone);
  document.body.appendChild(noscript);

  var html = document.body.innerHTML;
  html.should.equal(
    '<noscript><template><!--&lt;/noscript><img src=x onerror=alert(1)>--></template></noscript>'
  );
  html.should.not.containEql('</noscript><img');
};

exports.processingInstructionClosingAngleBracketEscapedEverywhere = function() {
  // A browser's HTML tokenizer treats '<?...' as a "bogus comment" that
  // ends at the very first '>' it sees, full stop -- regardless of any
  // fallback ancestor. Domino always appends its own literal '?>', so an
  // unescaped '>' inside PI data ends that bogus comment early and turns
  // the rest of the data into live markup, in any context.
  var document = domino.createDocument('');
  var div = document.createElement('div');
  var pi = document.createProcessingInstruction('x', 'data><img src=x onerror=alert(1)>');
  div.appendChild(pi);
  document.body.appendChild(div);

  var html = document.body.innerHTML;
  html.should.equal('<div><?x data&gt;<img src=x onerror=alert(1)&gt;?></div>');
  html.should.not.containEql('data><img');
};

exports.commentAbruptClosingEscapedEverywhere = function() {
  // A Comment whose data starts with '>' or '->' hits the HTML5
  // "abrupt-closing-of-empty-comment" tokenizer state and ends
  // immediately, independent of any fallback ancestor: e.g.
  // '<!-->...' parses as an *empty* comment followed by live markup.
  var document = domino.createDocument('');
  var div = document.createElement('div');
  var comment = document.createComment('><img src=x onerror=alert(1)>');
  div.appendChild(comment);
  document.body.appendChild(div);

  var html = document.body.innerHTML;
  html.should.equal('<div><!--&gt;<img src=x onerror=alert(1)>--></div>');
  html.should.not.containEql('<!--><img');
};

// Negative/scope-boundary test: a plain raw-content element (<style>,
// <script>, <xmp>, <plaintext>) with NO fallback ancestor, whose own text
// happens to contain what looks like its own closing tag, is left
// UNCHANGED by design. Real browsers do exactly the same thing (their own
// native `outerHTML`/`innerHTML` getters never escape <script>/<style>/
// <xmp>/<plaintext> text either) -- this is a pre-existing, spec-defined
// serialization property, not something introduced by or in scope for
// this fix, and "fixing" it is a conformance regression: the HTML5
// tokenizer has several tag-name-adjacent parsing states (script-data-
// double-escaped, PLAINTEXT's permanent raw mode, etc.) that this file's
// fp170_* tests and test/parsing.js's html5lib-tests both already pin
// down. If you're tempted to also escape this, don't -- see the ancestor-
// scoped tests above instead, which are the actual, narrower gap.
exports.plainRawContentOwnClosingTagLeftUnescapedWithNoFallbackAncestor = function() {
  var document = domino.createDocument('');
  var style = document.createElement('style');
  style.appendChild(document.createTextNode('body{}</style><img src=x onerror=alert(1)>'));
  document.body.appendChild(style);

  document.body.innerHTML.should.equal(
    '<style>body{}</style><img src=x onerror=alert(1)></style>'
  );
};
