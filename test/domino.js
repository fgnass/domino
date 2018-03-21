'use strict';
var domino = require('../lib');
var fs = require('fs');
var html = fs.readFileSync(__dirname + '/fixture/doc.html', 'utf8');

exports = exports.domino = {};

exports.matches = function() {
  // see https://developer.mozilla.org/en-US/docs/Web/API/Element.matches
  var d = domino.createWindow(html).document;
  var h1 = d.getElementById('lorem');
  h1.matches('h1').should.equal(true);
  h1.matches('body > h1').should.equal(true); // not rooted
  h1.matches('h1 > p').should.equal(false);
  h1.matches('h1,h2').should.equal(true);
  h1.matches('h2,h1').should.equal(true);
};

exports.querySelectorAll = function() {
  var window = domino.createWindow(html);
  var d = window.document;
  var nodeList = d.querySelectorAll('p');
  nodeList.should.have.property('item');
  nodeList.should.have.length(2);
  nodeList = d.querySelectorAll('p:not(.foo)');
  nodeList.should.have.length(1);
  nodeList = d.querySelectorAll('tt.foo');
  nodeList.should.have.length(2);
  nodeList = d.querySelectorAll('tt:not(.bar)');
  nodeList.should.have.length(1);
};

exports.qsaOrder = function() {
  var window = domino.createDocument('<h2></h2><h3></h3><h3></h3><h2></h2><h3></h3>');
  window.querySelectorAll('h2, h3').map(function(el) {
    return el.tagName;
  })
  .should.eql(['H2', 'H3', 'H3', 'H2', 'H3']);
};

exports.orphanQSA = function() {
  var document = domino.createDocument('<h1>foo</h1>');
  var p = document.createElement('p');
  p.querySelectorAll('p').should.have.length(0);
  p.querySelectorAll('p').should.have.length(0);
};

exports.gh20 = function() {
  var window = domino.createWindow('');
  var frag = window.document.createDocumentFragment();
  frag.querySelectorAll('p').should.have.length(0);

  frag.appendChild(window.document.createElement('p'));
  frag.querySelectorAll('p').should.have.length(1);

  frag.appendChild(window.document.createElement('p'));
  frag.querySelectorAll('p').should.have.length(2);
};

exports.gh22 = function() {
  var d=domino.createDocument("<div><h1>Hello world</h1><p>Hi</p></div>");
  d.querySelectorAll('div').should.have.length(1);
  d.body.querySelectorAll('div').should.have.length(1);
  d.body.querySelectorAll('h1').should.have.length(1);
  d.body.querySelectorAll('p').should.have.length(1);

  var w=domino.createWindow("<div><h1>Hello world</h1><p>Hi</p></div>");
  d=w.document;
  d.querySelectorAll('div').should.have.length(1);
  d.body.querySelectorAll('div').should.have.length(1);
  d.body.querySelectorAll('h1').should.have.length(1);
  d.body.querySelectorAll('p').should.have.length(1);
};

exports.gh31 = function() {
    var document, heading1, heading2;

    document = domino.createDocument("<h1>First</h1><h1>Second</h1>");
    document.querySelectorAll('h1').should.have.length(2);
    heading1 = document.body.querySelector('h1');
    heading1.getElementsByTagName('h1').should.have.length(0);
    heading1.querySelectorAll('h1').should.have.length(0);
    heading2 = document.body.querySelector('h1 + h1');
    heading2.querySelectorAll('h1').should.have.length(0);
};

exports.gh38 = function() {
  var d = domino.createDocument('<table><tr><th>Header cell</th><td>Data cell</td></tr></table>');
  var r = d.querySelector('tr');
  r.should.have.property('cells');
  r.cells.should.have.length(2);
};

exports.evilHandler = function() {
  var window = domino.createDocument('<a id="a" onclick="alert(\'breakin&#39;-stuff\')">');
  window = window; // avoid defined-but-not-used lint error
};

exports.title = function() {
  var d = domino.createDocument(html);
  if (d.head) { d.documentElement.removeChild(d.head); }
  d.should.have.property('head', null);
  d.should.have.property('title', '');
  d.querySelectorAll('head > title').should.have.length(0);

  // per the spec, if there is no <head>, then setting Document.title should
  // be a no-op.
  d.title = "Lorem!";
  d.title.should.equal('');
  d.querySelectorAll('head > title').should.have.length(0);

  // but if there is a <head>, then setting Document.title should create the
  // <title> element if necessary.
  d.documentElement.insertBefore(d.createElement('head'), d.body);
  (d.head === null).should.be.false();
  d.title.should.equal('');
  d.title = "Lorem!";
  d.title.should.equal("Lorem!");
  d.querySelectorAll('head > title').should.have.length(1);

  // verify that setting <title> works if there's already a title
  d.title = "ipsum";
  d.title.should.equal("ipsum");
  d.querySelectorAll('head > title').should.have.length(1); // still only 1!
};

exports.children = function() {
  var d = domino.createDocument(html);
  var c = d.body.children;
  c.should.have.length(4);
  c.should.have.property('0');
  var a = Array.prototype.slice.call(c);
  a.should.be.an.instanceof(Array);
  a.should.have.length(4);
  d.body.appendChild(d.createElement('p'));
  a = Array.prototype.slice.call(c);
  a.should.have.length(5);
};


exports.attributes1 = function() {
  var d = domino.createDocument();
  var el = d.createElement('div');
  el.setAttribute('foo', 'foo');
  el.setAttribute('bar', 'bar');
  el.attributes.should.have.length(2);
  el.attributes.item(0).value.should.equal('foo');
  el.removeAttribute('foo');
  el.attributes.should.have.length(1);
  el.attributes.item(0).name.should.equal('bar');
  el.setAttribute('baz', 'baz');
  el.attributes.should.have.length(2);
  el.attributes.item(1).value.should.equal('baz');
};

exports.classList = function() {
  var d = domino.createDocument();
  var el = d.body;
  el.className = 'foo bar boo';

  var cl = el.classList;
  cl.should.have.length(3);
  cl[0].should.equal('foo');
  cl.contains('bar').should.be.ok();
  cl.contains('baz').should.not.be.ok();
  cl.add('baz');
  cl.contains('baz').should.be.ok();
  cl.should.have.length(4);
  el.className.should.match(/baz/);
  cl.remove('foo');
  cl.should.have.length(3);
  el.className.should.not.match(/foo/);
  cl[0].should.not.equal('foo');
};

exports.attributes2 = function() {
  var d = domino.createDocument();
  var div = d.createElement('div');
  div.setAttribute('onclick', 't');
  div.attributes.should.have.property('onclick');
  div.attributes.onclick.should.have.property('value', 't');
  div.removeAttribute('onclick');
  (div.attributes.onclick === undefined).should.be.true();
};

exports.jquery1_9 = function() {
  var window = domino.createWindow(html);
  var f = __dirname + '/fixture/jquery-1.9.1.js';
  window._run(fs.readFileSync(f, 'utf8'), f);
  window.$.should.be.ok();
  window.$('.foo').should.have.length(3);
};

exports.jquery2_2 = function() {
  var window = domino.createWindow(html);
  window.$ = require(__dirname + '/fixture/jquery-2.2.0.js')(window);
  window.$.should.be.ok();
  window.$('.foo').should.have.length(3);
  window.$.ajaxTransport("test", function() {
    return { send: function() {}, abort: function() {} };
  });
  window.$.ajax({ url: 'test://', dataType: "test", timeout: 1, async: true });
};

exports.treeWalker = function() {
  var window = domino.createWindow(html);
  var d = window.document;
  var root = d.getElementById('tw');
  var tw = d.createTreeWalker(root, window.NodeFilter.SHOW_TEXT, function(n) {
    return (n.data === 'ignore') ?
      window.NodeFilter.FILTER_REJECT : window.NodeFilter.FILTER_ACCEPT;
  });
  tw.root.should.equal(root);
  tw.currentNode.should.equal(root);
  tw.whatToShow.should.equal(0x4);
  tw.filter.constructor.should.equal(window.NodeFilter.constructor);

  var actual = [];
  while (tw.nextNode() !== null) {
    actual.push(tw.currentNode);
  }

  actual.length.should.equal(4);
  actual.should.eql([
    root.firstChild.firstChild,
    root.firstChild.lastChild.firstChild,
    root.lastChild.firstChild,
    root.lastChild.lastChild.firstChild
  ]);
};

exports.nodeIterator = function() {
  var window = domino.createWindow(html);
  var d = window.document;
  var root = d.getElementById('tw');
  var ni = d.createNodeIterator(root, window.NodeFilter.SHOW_TEXT, function(n) {
    return (n.data === 'ignore') ?
      window.NodeFilter.FILTER_REJECT : window.NodeFilter.FILTER_ACCEPT;
  });
  ni.root.should.equal(root);
  ni.referenceNode.should.equal(root);
  ni.whatToShow.should.equal(0x4);
  ni.filter.constructor.should.equal(window.NodeFilter.constructor);

  var actual = [];
  for (var n = ni.nextNode(); n ; n = ni.nextNode()) {
    actual.push(n);
  }

  actual.length.should.equal(4);
  actual.should.eql([
    root.firstChild.firstChild,
    root.firstChild.lastChild.firstChild,
    root.lastChild.firstChild,
    root.lastChild.lastChild.firstChild
  ]);
};

exports.innerHTML = function() {
  var d = domino.createDocument();
  ['pre','textarea','listing'].forEach(function(elementName) {
    var div = d.createElement('div');
    var el = d.createElement(elementName);
    el.innerHTML = "a";
    div.appendChild(el);
    // no extraneous newline after element tag in this case
    div.innerHTML.should.equal('<'+elementName+'>a</'+elementName+'>');
    el.innerHTML = "\nb";
    // Note that this doesn't roundtrip:
    // see https://github.com/whatwg/html/issues/944
    div.innerHTML.should.equal('<'+elementName+'>\nb</'+elementName+'>');
  });
};

exports.outerHTML = function() {
  var tests = [
    // This doesn't round trip:
    // see https://github.com/whatwg/html/issues/944
    //'<body><pre>\n\na\n</pre></body>',
    '<body bgcolor="white"><h1 style="color: red">\nOne\n2 &amp; 3</h1></body>',
    '<body data-test="<>&amp;&quot;\'"></body>'
  ];
  tests.forEach(function(html) {
    var d = domino.createDocument(html);
    // Verify round-tripping.
    d.body.outerHTML.should.equal(html);
  });
};

exports.largeAttribute = function() {
  var size = 400000;
  // work around a performance regression in node 0.4.x - 0.6.x
  if (/^v0\.[0-6]\./.test(process.version)) { size = 50000; }
  var html = '<body><span data-large="';
  for (var i=0; i<size; i++) {
    html += '&amp;';
  }
  html += '"></span></body>';
  // this should not crash with a stack overflow!
  domino.createDocument(html);
};

exports.createTextNodeWithNonString = function() {
  var document = domino.createDocument('<html></html>');
  var tests = [
    [false, 'false'],
    [NaN, 'NaN'],
    [123, '123'],
    [{}, '[object Object]'],
    [[], ''],
    [null, 'null'],
    [undefined, 'undefined'],
  ];
  for(var i=0; i<tests.length; i++) {
    var element = document.createElement('div');
    var textNode = document.createTextNode(tests[i][0]);
    element.appendChild(textNode);
    element.innerHTML.should.equal(tests[i][1]);
  }
};

exports.adoption = function() {
  // See https://github.com/fgnass/domino/pull/36
  var html = "<b>X<b>Y</b>Z</b>";
  var doc = domino.createDocument(html);
  doc.body.innerHTML.should.equal(html);
};

exports.attributeSelector = function() {
  var html = '<h1>foo</h1><h2 id="x" title="y" lang="en" dir="ltr" ' +
    'accessKey="z" hidden tabIndex="2">bar</h2>';
  var doc = domino.createDocument(html);
  var h1 = doc.querySelector('h1');
  h1.matches('*[id]').should.equal(false);
  h1.matches('*[title]').should.equal(false);
  h1.matches('*[lang]').should.equal(false);
  h1.matches('*[dir]').should.equal(false);
  h1.matches('*[accessKey]').should.equal(false);
  h1.matches('*[hidden]').should.equal(false);
  h1.matches('*[tabIndex]').should.equal(false);

  var h2 = doc.querySelector('h2');
  h2.matches('*[id]').should.equal(true);
  h2.matches('*[title]').should.equal(true);
  h2.matches('*[lang]').should.equal(true);
  h2.matches('*[dir]').should.equal(true);
  h2.matches('*[accessKey]').should.equal(true);
  h2.matches('*[hidden]').should.equal(true);
  h2.matches('*[tabIndex]').should.equal(true);

  h1.matches('*[matches]').should.equal(false);
  h1.matches('*[querySelector]').should.equal(false);

  h1.matches('*[isHTML]').should.equal(false);
};

exports.crHandling = function() {
  var html = '<div\rid=a data-test=1\rfoo="\r"\rbar=\'\r\'\rbat=\r>\r</div\r>';
  var doc = domino.createDocument(html);
  var div = doc.querySelector('#a');
  (div != null).should.be.true(); // jshint ignore:line
  // all \r should be converted to \n
  div.outerHTML.should.equal('<div id="a" data-test="1" foo="\n" bar="\n" bat="">\n</div>');
};

exports.eqAttr = function() {
  var html = "<div id=a ==x><a=B></A=b></div>";
  var doc = domino.createDocument(html);
  var div = doc.querySelector('#a');
  (div != null).should.be.true(); // jshint ignore:line
  div.attributes.length.should.equal(2);
  div.attributes.item(1).name.should.equal('=');
  div.children.length.should.equal(1);
  div.children[0].tagName.should.equal('A=B');
};

exports.tagNameCase = function() {
  // See https://github.com/fgnass/domino/pull/41
  var impl = domino.createDOMImplementation();
  var namespace = 'http://schemas.xmlsoap.org/soap/envelope/';
  var qualifiedName = 'Envelope';
  var doc = impl.createDocument(namespace, qualifiedName, null);
  doc.documentElement.tagName.should.equal(qualifiedName);
};

exports.fastAttributes = function() {
  // test the SIMPLETAG/SIMPLEATTR path in HTMLParser
  var html = "<div id=a b=\"x &quot;y\" c='a \rb'><\np></div>";
  var doc = domino.createDocument(html);
  var div = doc.querySelector('#a');
  (div != null).should.be.true(); // jshint ignore:line
  div.attributes.length.should.equal(3);
  div.attributes.item(1).value.should.equal('x "y');
  div.attributes.item(2).value.should.equal('a \nb');
  div.children.length.should.equal(0);
};

exports.anchorElement = function() {
  var html = "<a href='http://user:pass@example.com:1234/foo/bar?bat#baz'>!</a>";
  var doc = domino.createDocument(html);
  var a = doc.querySelector('a');
  (a != null).should.be.true(); // jshint ignore:line
  a.href.should.equal('http://user:pass@example.com:1234/foo/bar?bat#baz');
  a.protocol.should.equal('http:');
  a.host.should.equal('example.com:1234');
  a.hostname.should.equal('example.com');
  a.port.should.equal('1234');
  a.pathname.should.equal('/foo/bar');
  a.search.should.equal('?bat');
  a.hash.should.equal('#baz');
  a.username.should.equal('user');
  a.password.should.equal('pass');
  a.origin.should.equal('http://example.com:1234');
  // now try mutating!
  a.protocol = 'https:';
  a.href.should.equal('https://user:pass@example.com:1234/foo/bar?bat#baz');
  a.hostname = 'other.net';
  a.href.should.equal('https://user:pass@other.net:1234/foo/bar?bat#baz');
  a.port = 5678;
  a.href.should.equal('https://user:pass@other.net:5678/foo/bar?bat#baz');
  a.pathname = '/blam/';
  a.href.should.equal('https://user:pass@other.net:5678/blam/?bat#baz');
  a.search = '?bat&banana';
  a.href.should.equal('https://user:pass@other.net:5678/blam/?bat&banana#baz');
  a.hash = '#oranges';
  a.href.should.equal('https://user:pass@other.net:5678/blam/?bat&banana#oranges');
  a.username = 'joe';
  a.href.should.equal('https://joe:pass@other.net:5678/blam/?bat&banana#oranges');
  a.password = 'smith';
  a.href.should.equal('https://joe:smith@other.net:5678/blam/?bat&banana#oranges');
};

exports.gh59 = function() {
  var html = '<html><body><span style="display:none">foo</span></body></html>';
  var doc = domino.createDocument(html);
  doc.querySelectorAll('span[style]').should.have.length(1);
  doc.querySelectorAll('span[style="display:none"]').should.have.length(1);
  doc.querySelectorAll('span[style*="display:none"]').should.have.length(1);
};

exports.duplicateID = function() {
  var doc = domino.createDocument('<root></root>');
  var root = doc.documentElement;

  function makeElement(name) {
    var elt = doc.createElement(name);
    elt.setAttribute("id", "x");
    return elt;
  }

  var a = root.appendChild(makeElement("a"));
  var b = root.appendChild(makeElement("b"));
  var c = root.appendChild(makeElement("c"));
  var d = root.appendChild(makeElement("d"));
  doc.getElementById("x").should.equal(a);
  root.removeChild(a);
  doc.getElementById("x").should.equal(b);
  root.removeChild(c);
  root.removeChild(b);
  doc.getElementById("x").should.equal(d);
  root.removeChild(d);
  (doc.getElementById("x") === null).should.be.true();
};

exports.normalize = function() {
  var doc = domino.createDocument('<span id="x"><!---->foo</span>');
  var span = doc.getElementById("x");
  span.appendChild(doc.createTextNode('bar'));
  span.outerHTML.should.equal('<span id="x"><!---->foobar</span>');
  span.normalize();
  span.outerHTML.should.equal('<span id="x"><!---->foobar</span>');
  span.childNodes[1].nodeValue.should.equal('foobar');
};

exports.replaceChild = function() {
  var impl = new domino.impl.DOMImplementation();
  var doc = impl.createDocument();
  var root = doc.appendChild(doc.createElement('root'));
  root.outerHTML.should.equal('<root></root>');
  var a = root.appendChild(doc.createElement('a'));
  root.outerHTML.should.equal('<root><a></a></root>');
  var b = doc.createElement('b');

  function capture(f) {
    var events = [];
    doc._setMutationHandler(function(info) {
      events.push(info);
    });
    f();
    doc._setMutationHandler(null);
    return events;
  }

  // Replace with unrooted
  capture(function() {
    root.replaceChild(b, a).should.equal(a);
  }).should.deepEqual([
    {
      type: 4, // Remove
      target: root,
      node: a
    },
    {
      type: 6, // Insert
      target: root,
      node: b
    }]);
  root.outerHTML.should.equal('<root><b></b></root>');

  root.replaceChild(a, b).should.equal(b);
  root.outerHTML.should.equal('<root><a></a></root>');

  // Move node
  var c = doc.createElement('c');
  root.appendChild(b);
  root.appendChild(c);
  capture(function() {
    root.replaceChild(c, a);
  }).should.deepEqual([
    {
      type: 4, // Remove
      target: root,
      node: a
    },
    {
      type: 5, // Move
      target: c
    }]);
  root.outerHTML.should.equal('<root><c></c><b></b></root>');

  // Replace under unrooted parent
  var df = doc.createDocumentFragment();
  var d = df.appendChild(doc.createElement('d'));
  var e = df.appendChild(doc.createElement('e'));
  var f = doc.createElement('f');
  df.replaceChild(f, e);
  df.serialize().should.equal('<d></d><f></f>');
  d = d; // avoid defined-but-not-used warning

  // Replace rooted node with document fragment
  root.appendChild(a);
  root.replaceChild(df, b);
  root.outerHTML.should.equal('<root><c></c><d></d><f></f><a></a></root>');
};

exports.contains = function() {
  // see https://developer.mozilla.org/en-US/docs/Web/API/Node/contains
  var document = domino.createWindow(html).document;
  var h1 = document.getElementById('lorem');
  h1.contains(null).should.equal(false);
  h1.contains(h1).should.equal(true);
  h1.childNodes[0].contains(h1).should.equal(false);
  h1.contains(h1.childNodes[0]).should.equal(true);
  document.body.contains(h1).should.equal(true);
  var nodeList = document.querySelectorAll('p');
  h1.contains(nodeList[0]).should.equal(false);
  document.body.contains(nodeList[0]).should.equal(true);
  nodeList[0].contains(nodeList[1]).should.equal(false);
  nodeList[1].contains(nodeList[0]).should.equal(false);
};

exports.parseImportant = function() {
  var html = '<p style="font-family:sans-serif; text-decoration:none !important">foo</p>';
  var doc = domino.createDocument(html);
  var p = doc.querySelector('p');
  p.style.fontFamily.should.equal('sans-serif');
  p.style.textDecoration.should.equal('none');
};

exports.gh70 = function() {
  var document = domino.createDocument('<h1 class="hello">Hello world</h1>');
  var h1 = document.querySelector('h1');
  var classAttr = h1.attributes.item(0);

  classAttr.value.should.equal('hello');
  classAttr.nodeValue.should.equal('hello');
  classAttr.textContent.should.equal('hello');

  classAttr.nodeValue = 'nodeValue';
  classAttr.value.should.equal('nodeValue');
  classAttr.nodeValue.should.equal('nodeValue');
  classAttr.textContent.should.equal('nodeValue');

  classAttr.textContent = 'textContent';
  classAttr.value.should.equal('textContent');
  classAttr.nodeValue.should.equal('textContent');
  classAttr.textContent.should.equal('textContent');
};

exports.gh71 = function() {
  var document = domino.createDocument('<h1 style="color:red !important">Hello world</h1>');
  var h1 = document.querySelector('h1');
  h1.style.display = 'none';
  h1.outerHTML.should.equal('<h1 style="color: red !important; display: none;">Hello world</h1>');
};

exports.gh72 = function() {
  var window = domino.createWindow('<h1>Hello, world!</h1>');
  window.setTimeout.should.have.type('function');
  window.clearTimeout.should.have.type('function');
  window.setInterval.should.have.type('function');
  window.clearInterval.should.have.type('function');
};

exports.navigatorID = function() {
  var window = domino.createWindow('<h1>Hello, world!</h1>');
  window.navigator.appCodeName.should.equal("Mozilla");
  window.navigator.taintEnabled().should.equal(false);
};

exports.template1 = function() {
  var document = domino.createDocument("<table><tbody><template id=row><tr><td><td>");
  document.body.innerHTML.should.equal('<table><tbody><template id="row"><tr><td></td><td></td></tr></template></tbody></table>');
  var t = document.getElementById("row");
  t.should.be.an.instanceof(domino.impl.HTMLTemplateElement);
  t.childNodes.length.should.equal(0);
  t.content.should.be.an.instanceof(domino.impl.DocumentFragment);
  t.content.serialize().should.equal("<tr><td></td><td></td></tr>");
  document.querySelectorAll("td").length.should.equal(0);
  t.content.querySelectorAll("td").length.should.equal(2);
  t.content.ownerDocument.should.not.equal(document);
  t.content.querySelectorAll("*").map(function(el) {
    el.ownerDocument.should.equal(t.content.ownerDocument);
  });
};

exports.template2 = function() {
  // Templates go in <head> by default.
  var document = domino.createDocument("<template>x<!--hi");
  document.head.childNodes.length.should.equal(1);
  document.head.children[0].tagName.should.equal("TEMPLATE");
  var df = document.head.children[0].content;
  df.should.be.an.instanceof(domino.impl.DocumentFragment);
  df.ownerDocument.should.not.equal(document);
  df.childNodes.length.should.equal(2);
  df.childNodes[0].ownerDocument.should.equal(df.ownerDocument);
  df.childNodes[1].ownerDocument.should.equal(df.ownerDocument);
  document.head.innerHTML.should.equal('<template>x<!--hi--></template>');
};

// HTMLTemplateElement.innerHTML
// see https://github.com/w3c/DOM-Parsing/issues/1
exports.template3 = function() {
  var document = domino.createDocument();
  var t = document.createElement("template");
  t.should.be.an.instanceof(domino.impl.HTMLTemplateElement);
  t.childNodes.length.should.equal(0);
  t.content.should.be.an.instanceof(domino.impl.DocumentFragment);
  // This is the key line:
  t.innerHTML = '<div>abc</div><p>def</p>';
  t.innerHTML.should.equal('<div>abc</div><p>def</p>');
  t.content.ownerDocument.should.not.equal(document);
  t.content.childNodes.length.should.equal(2);
  t.content.querySelectorAll("*").map(function(el) {
    el.ownerDocument.should.equal(t.content.ownerDocument);
  });
  // Non-standard (gh #73)
  t.content.outerHTML.should.equal('<div>abc</div><p>def</p>');
};

exports.fosterParent1 = function() {
  var document = domino.createDocument('<table><tr>x<a>foo<td>y');
  // In this case the "x<a>" gets foster-parented *before* the <tr>
  document.body.innerHTML.should.equal("x<a>foo</a><table><tbody><tr><td>y</td></tr></tbody></table>");
};

exports.fosterParent2 = function() {
  var document = domino.createDocument('foster test');
  var thead = document.createElement("thead");
  // exercise the "no table in open element stack" case in foster parenting
  // algorithm.
  thead.innerHTML = "<tr>x<a>foo<td>y";
  // Note how "x" got placed *after* the <tr> in this case.
  thead.outerHTML.should.equal('<thead><tr><td>y</td></tr>x<a>foo</a></thead>');
};

exports.fosterParent3 = function() {
  var document = domino.createDocument('<body><template><table><tr>x</template><table><template><tr>y');
  document.body.innerHTML.should.equal("<template>x<table><tbody><tr></tr></tbody></table></template><table><template><tr></tr>y</template></table>");
  var templates = document.querySelectorAll("template");
  templates.length.should.equal(2);
  document.querySelectorAll("tr").length.should.equal(0);
  Array.prototype.forEach.call(templates, function(t) {
    t.ownerDocument.should.equal(document);
    t.content.ownerDocument.should.not.equal(document);
    t.content.querySelectorAll("*").map(function(el) {
      el.ownerDocument.should.equal(t.content.ownerDocument);
    });
  });
  templates[0].content.ownerDocument.should.equal(
    templates[1].content.ownerDocument
  );
};

exports.canvasTag = function() {
  var document = domino.createDocument('<canvas width=23 height=45>');
  var canvas = document.querySelector('canvas');
  canvas.should.be.instanceof(domino.impl.HTMLElement);
  canvas.should.be.instanceof(domino.impl.HTMLCanvasElement);
  canvas.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  canvas.width.should.equal(23);
  canvas.height.should.equal(45);
};

exports.dialogTag = function() {
  // <p> should be closed before <dialog>
  var document = domino.createDocument('<div><p>x<dialog open returnvalue="foo">y');
  document.body.innerHTML.should.equal('<div><p>x</p><dialog open="" returnvalue="foo">y</dialog></div>');
  var dialog = document.querySelector('dialog');
  dialog.should.be.instanceof(domino.impl.HTMLElement);
  dialog.should.be.instanceof(domino.impl.HTMLDialogElement);
  dialog.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  dialog.open.should.equal(true);
  dialog.returnValue.should.equal("foo");
};

exports.mainTag = function() {
  // <p> should be closed before <main>
  var document = domino.createDocument('<div><p>x<main>y');
  document.body.innerHTML.should.equal('<div><p>x</p><main>y</main></div>');
  var main = document.querySelector('main');
  main.should.be.instanceof(domino.impl.HTMLElement);
  main.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
};

exports.menuItemTag = function() {
  // <menuitem> should be special
  var document = domino.createDocument('<menuitem type="checkbox" checked default>');
  document.body.innerHTML.should.equal('<menuitem type="checkbox" checked="" default=""></menuitem>');
  var menuitem = document.querySelector('menuitem');
  menuitem.should.be.instanceof(domino.impl.HTMLElement);
  menuitem.should.be.instanceof(domino.impl.HTMLMenuItemElement);
  menuitem.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  menuitem.type.should.equal("checkbox");
  menuitem.checked.should.equal(true);
  menuitem.disabled.should.equal(false);
  menuitem.default.should.equal(true);
};

exports.rubyTags = function() {
  var document = domino.createDocument(
    '<p><ruby id=a>base<rt>annotation</ruby>' +
    '<ruby id=b><rb>上<rb>手<rt>じよう<rt>ず<rtc><rt>jou<rt>zu'
  );
  document.body.innerHTML.should.equal(
    '<p><ruby id="a">base<rt>annotation</rt></ruby>' +
    '<ruby id="b"><rb>上</rb><rb>手</rb><rt>じよう</rt><rt>ず</rt><rtc><rt>jou</rt><rt>zu</rt></rtc></ruby></p>'
  );
  Array.prototype.forEach.call(
    document.querySelectorAll('ruby,rb,rp,rt,rtc'), function(el) {
      el.should.be.instanceof(domino.impl.HTMLElement);
      el.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
    });
};

exports.sourceTag = function() {
  var document = domino.createDocument('<base href=http://example.com><video controls><source src="foo.webm" type="video/webm">Sorry, no HTML5 video.');
  document.body.innerHTML.should.equal('<video controls=""><source src="foo.webm" type="video/webm">Sorry, no HTML5 video.</video>');
  var source = document.querySelector('source');
  source.should.be.instanceof(domino.impl.HTMLElement);
  source.should.be.instanceof(domino.impl.HTMLSourceElement);
  source.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  source.src.should.equal("http://example.com/foo.webm");
  source.type.should.equal("video/webm");
};

exports.trackTag = function() {
  var document = domino.createDocument('<base href=http://example.com><video poster="foo.jpg"><source src="foo.webm" type="video/webm"><track kind="captions" src="en-captions.vtt" srclang="en">');
  document.body.innerHTML.should.equal('<video poster="foo.jpg"><source src="foo.webm" type="video/webm"><track kind="captions" src="en-captions.vtt" srclang="en"></video>');
  var track = document.querySelector('track');
  track.should.be.instanceof(domino.impl.HTMLElement);
  track.should.be.instanceof(domino.impl.HTMLTrackElement);
  track.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  track.kind.should.equal("captions");
  track.src.should.equal("http://example.com/en-captions.vtt");
  track.srclang.should.equal("en");
};

exports.elementInterface = function() {
  [
    "acronym", "basefont", "big", "center", "nobr", "noembed", "noframes",
    "plaintext", "rb", "rtc", "strike", "tt"
  ].forEach(function(tag) {
    var document = domino.createDocument('<'+tag+'>');
    var elt = document.querySelector(tag);
    elt.should.be.instanceof(domino.impl.HTMLElement);
    elt.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  });
  [
    "listing", "xmp", "pre"
  ].forEach(function(tag) {
    var document = domino.createDocument('<'+tag+'>');
    var elt = document.querySelector(tag);
    elt.should.be.instanceof(domino.impl.HTMLElement);
    elt.should.be.instanceof(domino.impl.HTMLPreElement);
    elt.should.not.be.instanceof(domino.impl.HTMLUnknownElement);
  });
};

exports.gh79 = function() {
  // CSS identifiers can only contain the characters [a-zA-Z0-9] and
  // ISO 10646 characters U+00A0 and higher, plus the hyphen (-) and the
  // underscore (_).  But they *can* have escaped characters.
  var doc = '<div id="cite_note-13.3F_It_Can\'t_Be!-3"></div>';
  var document = domino.createDocument(doc);
  document.body.innerHTML.should.equal(doc);
  (function() {
    document.querySelector("#cite_note-13.3F_It_Can't_Be!-3");
  }).should.throw({ name: 'SyntaxError' });
  var div = document.querySelectorAll("#cite_note-13\\.3F_It_Can\\'t_Be\\!-3");
  div.length.should.equal(1);
};

exports.small_list = function() {
  var doc = '<ul><li><small class=foo>x</li><li>y<ul><li>b</li><li>c</small></li></ul></li></ul>';
  var document = domino.createDocument(doc);
  var smalls = document.querySelectorAll('small');
  smalls.length.should.equal(4);
  for (var i=0; i<smalls.length; i++) {
    smalls[i].classList.contains('foo').should.be.true();
  }
};

exports.menuitem = function() {
  var doc = '<menuitem id=a label=" b "><menuitem id=c> d <b> e ';
  var document = domino.createDocument(doc);
  document.body.innerHTML.should.equal('<menuitem id="a" label=" b "></menuitem><menuitem id="c"> d <b> e </b></menuitem>');
  var itema = document.getElementById('a');
  (itema != null).should.be.true(); // jshint ignore:line
  itema.should.be.an.instanceof(domino.impl.HTMLMenuItemElement);
  itema.label.should.equal(' b ');
  itema.label = ' x ';
  itema.label.should.equal(' x ');
  itema.hasAttribute('label').should.be.true();
  itema.getAttribute('label').should.equal(' x ');
  itema.outerHTML.should.equal('<menuitem id="a" label=" x "></menuitem>');

  var itemb = document.getElementById('c');
  (itemb != null).should.be.true(); // jshint ignore:line
  itemb.should.be.an.instanceof(domino.impl.HTMLMenuItemElement);
  itemb.label.should.equal('d e');
  itemb.label = ' y ';
  itemb.label.should.equal(' y ');
  itemb.hasAttribute('label').should.be.true();
  itemb.getAttribute('label').should.equal(' y ');
  itemb.outerHTML.should.equal('<menuitem id="c" label=" y "> d <b> e </b></menuitem>');
};

exports.createSvgElements = function() {
  var document = domino.createDocument();

  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);

  svg.should.be.instanceOf(domino.impl.SVGSVGElement);
  document.body.innerHTML.should.equal("<svg></svg>");
};

exports.gh95 = function() {
    var document = domino.createDocument(
        '<body><a href="foo\'s">bar</a></body>'
    );
    (function() {
        document.querySelectorAll("a[href=foo's]");
    }).should.throw({ name: 'SyntaxError' });
    document.querySelectorAll("a[href=foo\\'s]").length.should.equal(1);
};

exports.propertyWritability = function () { // gh #89
  var window = domino.createWindow('');
  var document = domino.createDocument();

  var assertWritable = function(object, property) {
    var replacement = function () { };
    object[property] = replacement;
    object[property].should.equal(replacement, property + " should be writable");
  };

  assertWritable(window, 'HTMLElement');
  assertWritable(document, 'importNode');
  assertWritable(document, 'createElement');
  assertWritable(document, 'createElementNS');
};

exports.gh90 = function() {
  var doc = '<input type="checkbox">';
  var document = domino.createDocument(doc);
  document.body.innerHTML.should.equal(doc);

  var input = document.querySelector('input');
  input.checked.should.equal(false);

  input.checked = true;
  input.checked.should.equal(true);
  input.outerHTML.should.equal('<input type="checkbox" checked="">');

  input.checked = false;
  input.checked.should.equal(false);
  input.outerHTML.should.equal(doc);

  // Now test again, using hasAttribute/hasAttributeNS directly.
  input.hasAttribute('checked').should.equal(false);
  input.hasAttributeNS(null, 'checked').should.equal(false);
  input.hasAttributeNS('foo', 'checked').should.equal(false);

  input.setAttribute('checked', 'bar');
  input.setAttributeNS('foo', 'checked', 'bat');

  input.hasAttribute('checked').should.equal(true);
  input.hasAttributeNS(null, 'checked').should.equal(true);
  input.hasAttributeNS('foo', 'checked').should.equal(true);

  input.removeAttribute('checked');
  input.removeAttributeNS('foo', 'checked');

  input.hasAttribute('checked').should.equal(false);
  input.hasAttributeNS(null, 'checked').should.equal(false);
  input.hasAttributeNS('foo', 'checked').should.equal(false);
};

exports.gh98 = function() {
  var doc = '<a href="/"></a>';
  var document = domino.createDocument(doc);
  var a = document.querySelector('a');
  (a.style.getPropertyValue('background') === '').should.be.true();
};

exports.gh99 = function() {
  // test '#foo' optimization in querySelectorAll
  var window = domino.createWindow(
    '<!DOCTYPE html><html><body></body></html>'
  );
  var doc = window.document;
  var match = doc.querySelectorAll('#coordinates');
  match.length.should.equal(0);
  if (Array.from) {
    Array.from(match).length.should.equal(0);
  }
  (match[0] === undefined).should.be.true();

  // continue test, now w/ multiple elements sharing same id.
  doc.body.innerHTML = '<p id=a>x</p><p id=a>y</p>';
  match = doc.querySelectorAll('#a');
  match.length.should.equal(2);
  if (Array.from) {
    Array.from(match).length.should.equal(2);
  }
  match[0].textContent.should.equal('x');
  match[1].textContent.should.equal('y');
};

exports.gh112 = function() {
  // attributes named 'xmlns' are fine. (gh #112)
  var window = domino.createWindow(
    '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><b></b></html>'
  );
  var document = window.document;
  document.documentElement.setAttribute('xmlns', 'test');
  var b = document.querySelector('b');
  b.innerHTML = '<test></test>';
  var test = document.querySelector('test');
  // Note that this seems contrary to what is implied by
  // https://lists.w3.org/Archives/Public/www-dom/2011JulSep/0153.html
  // but matches what modern browsers do.
  b.namespaceURI.should.equal('http://www.w3.org/1999/xhtml');
  test.namespaceURI.should.equal('http://www.w3.org/1999/xhtml');
};

exports.gh109 = function() {
  var document = domino.createDocument();
  var div = document.createElement('div');
  div.classList.add('one', 'two');
  div.classList.length.should.equal(2);
  div.classList.contains('one').should.be.true();
  div.classList.contains('two').should.be.true();
  div.classList.remove('one', 'two');
  div.classList.length.should.equal(0);
  div.classList.contains('one').should.be.false();
  div.classList.contains('two').should.be.false();
};

exports.arrayfrom = function() {
    // If your version of node supports Array.from, it should support
    // Array.from(node.attributes) ... even though we don't use proxies.
    if (typeof(Array.from) !== 'function') { return; }
    var d = domino.createDocument('');
    var e = d.createElement('span');
    e.setAttribute('a','1');
    e.setAttribute('b','2');
    var a = Array.from(e.attributes);
    a.should.have.length(2);
    a[0].should.have.property('name','a');
    a[0].should.have.property('value','1');
    a[1].should.have.property('name','b');
    a[1].should.have.property('value','2');
};

exports.gh119 = function() {
  var document = domino.createDocument('<div></div>');
  var div = document.querySelector('div');
  div.style.flex = '1 1 0px';
  div.outerHTML.should.equal('<div style="flex: 1 1 0px;"></div>');

  document = domino.createDocument('<div></div>');
  div = document.querySelector('div');
  div.style.flexFlow = 'row wrap';
  div.outerHTML.should.equal('<div style="flex-flow: row wrap;"></div>');

  document = domino.createDocument('<div></div>');
  div = document.querySelector('div');
  div.style.flexBasis = '0px';
  div.style.flexGrow = 1;
  div.style.flexShrink = 1;
  div.style.flexDirection = 'column';
  div.style.flexWrap = 'wrap';
  
  div.outerHTML.should.equal('<div style="flex-basis: 0px; flex-grow: 1; flex-shrink: 1; flex-direction: column; flex-wrap: wrap;"></div>');
};
