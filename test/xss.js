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

// <noscript>, <iframe>, <noembed> and <noframes> are RAWTEXT to a browser
// (noscript when scripting is enabled): only their own end tag ends them,
// so it must be escaped wherever it appears in their serialized content.

var FALLBACK_TAGS = ['noscript', 'iframe', 'noembed', 'noframes'];
var PAYLOAD = '<img src=x onerror=alert(1)>';

// Serialize `tag`, with `build(document, container)` filling it in.
function serializeFallback(tag, build) {
  var window = domino.createWindow('', 'http://example.com/');
  var document = window.document;
  var container = document.createElement(tag);
  build(document, container);
  document.body.appendChild(container);
  var html = document.body.innerHTML;
  html.should.not.containEql('</' + tag + '>' + PAYLOAD);
  return html;
}

exports.fallbackRawContentClosingTagEscapedInComment = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      container.appendChild(document.createComment('</' + tag + '>' + PAYLOAD));
    }).should.equal(
      '<' + tag + '><!--&lt;/' + tag + '>' + PAYLOAD + '--></' + tag + '>'
    );
  });
};

exports.fallbackRawContentClosingTagEscapedInProcessingInstruction = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      container.appendChild(document.createProcessingInstruction(
        'x', '</' + tag + '>' + PAYLOAD
      ));
    }).should.equal(
      // '</tag&' is not an end tag, so needs no further escaping
      '<' + tag + '><?x </' + tag + '&gt;<img src=x onerror=alert(1)&gt;?></' + tag + '>'
    );
  });
};

exports.fallbackRawContentClosingTagEscapedInText = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      container.appendChild(document.createTextNode('</' + tag + '>' + PAYLOAD));
    }).should.equal(
      '<' + tag + '>&lt;/' + tag + '>' + PAYLOAD + '</' + tag + '>'
    );
  });
};

exports.fallbackRawContentClosingTagEscapedAcrossTextNodes = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      container.appendChild(document.createTextNode('</' + tag));
      container.appendChild(document.createTextNode('>' + PAYLOAD));
    }).should.equal(
      '<' + tag + '>&lt;/' + tag + '>' + PAYLOAD + '</' + tag + '>'
    );
  });
};

exports.fallbackRawContentClosingTagEscapedWithOtherTerminators = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    ['\t', '\n', '\f', '\r', ' ', '/'].forEach(function(c) {
      serializeFallback(tag, function(document, container) {
        container.appendChild(document.createComment(
          '</' + tag.toUpperCase() + c + '>' + PAYLOAD
        ));
      }).should.equal(
        '<' + tag + '><!--&lt;/' + tag.toUpperCase() + c + '>' + PAYLOAD + '--></' + tag + '>'
      );
    });
  });
};

exports.fallbackRawContentClosingTagEscapedInNestedRawContentElement = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      var xmp = document.createElement('xmp');
      xmp.appendChild(document.createTextNode('</' + tag + '>' + PAYLOAD));
      container.appendChild(xmp);
    }).should.equal(
      '<' + tag + '><xmp>&lt;/' + tag + '>' + PAYLOAD + '</xmp></' + tag + '>'
    );
  });
};

exports.fallbackRawContentClosingTagEscapedInNestedFallbackElement = function() {
  serializeFallback('noscript', function(document, container) {
    var iframe = document.createElement('iframe');
    iframe.appendChild(document.createTextNode('</noscript>' + PAYLOAD));
    container.appendChild(iframe);
  }).should.equal(
    '<noscript><iframe>&lt;/noscript>' + PAYLOAD + '</iframe></noscript>'
  );
};

exports.fallbackRawContentClosingTagEscapedInTemplate = function() {
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      var template = document.createElement('template');
      template.content.appendChild(document.createComment('</' + tag + '>' + PAYLOAD));
      // cloneNode(true) used to drop the template's content
      container.appendChild(template.cloneNode(true));
    }).should.equal(
      '<' + tag + '><template><!--&lt;/' + tag + '>' + PAYLOAD + '--></template></' + tag + '>'
    );
  });
};

exports.processingInstructionClosingAngleBracketEscaped = function() {
  // '<?' starts a bogus comment, which ends at the first '>'
  var document = domino.createDocument('');
  var div = document.createElement('div');
  div.appendChild(document.createProcessingInstruction('x', 'data>' + PAYLOAD));
  document.body.appendChild(div);
  document.body.innerHTML.should.equal(
    '<div><?x data&gt;<img src=x onerror=alert(1)&gt;?></div>'
  );
};

exports.commentClosingTagEscaped = function() {
  var document = domino.createDocument('');
  var div = document.createElement('div');
  document.body.appendChild(div);
  [
    ['>', '&gt;'],
    ['->', '-&gt;'],
    ['a-->', 'a--&gt;'],
    ['a--!>', 'a--!&gt;'],
  ].forEach(function(c) {
    div.textContent = '';
    div.appendChild(document.createComment(c[0] + PAYLOAD));
    div.innerHTML.should.equal('<!--' + c[1] + PAYLOAD + '-->');
  });
};

exports.attributeAngleBracketsEscaped = function() {
  // whatwg/html#6235: the <p> keeps the <style> in SVG here, but not when
  // the serialized HTML is parsed again.
  var document = domino.createDocument('');
  document.body.innerHTML =
    '<svg></p><style><a title="</style><img src onerror=alert(1)>">';
  document.body.innerHTML.should.equal(
    '<svg><p></p><style><a title="&lt;/style&gt;&lt;img src onerror=alert(1)&gt;">' +
    '</a></style></svg>'
  );
  FALLBACK_TAGS.forEach(function(tag) {
    serializeFallback(tag, function(document, container) {
      var span = document.createElement('span');
      span.setAttribute('title', '</' + tag + '>' + PAYLOAD);
      container.appendChild(span);
    }).should.equal(
      '<' + tag + '><span title="&lt;/' + tag +
        '&gt;&lt;img src=x onerror=alert(1)&gt;"></span></' + tag + '>'
    );
  });
};

// Like a browser, we don't escape the text of <style>, <script>, <xmp>
// and so on outside a fallback element: it can't be done without
// changing what the text means.
exports.rawContentOwnClosingTagNotEscaped = function() {
  var document = domino.createDocument('');
  var style = document.createElement('style');
  style.appendChild(document.createTextNode('body{}</style>' + PAYLOAD));
  document.body.appendChild(style);

  document.body.innerHTML.should.equal(
    '<style>body{}</style>' + PAYLOAD + '</style>'
  );
};
