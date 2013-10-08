var domino = require('../lib');
var fs = require('fs');
var html = fs.readFileSync(__dirname + '/fixture/doc.html', 'utf8');

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
}

exports.qsaOrder = function() {
  var window = domino.createDocument('<h2></h2><h3></h3><h3></h3><h2></h2><h3></h3>');
  window.querySelectorAll('h2, h3').map(function(el) {
    return el.tagName;
  })
  .should.eql(['H2', 'H3', 'H3', 'H2', 'H3']);
}

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
  d.head.should.not.equal(null);
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
  c.should.have.property(0);
  var a = Array.prototype.slice.call(c);
  a.should.be.an.instanceof(Array);
  a.should.have.length(4);
  d.body.appendChild(d.createElement('p'));
  a = Array.prototype.slice.call(c);
  a.should.have.length(5);
}


exports.attributes = function() {
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
}

exports.classList = function() {
  var d = domino.createDocument();
  var el = d.body;
  el.className = 'foo bar boo';

  var cl = el.classList;
  cl.should.have.length(3);
  cl[0].should.equal('foo');
  cl.contains('bar').should.be.ok;
  cl.contains('baz').should.not.be.ok;
  cl.add('baz');
  cl.contains('baz').should.be.ok;
  cl.should.have.length(4);
  el.className.should.match(/baz/);
  cl.remove('foo');
  cl.should.have.length(3);
  el.className.should.not.match(/foo/);
  cl[0].should.not.equal('foo');
}

exports.attributes = function() {
  var d = domino.createDocument();
  var div = d.createElement('div');
  div.setAttribute('onclick', 't');
  div.attributes.should.have.property('onclick');
  div.attributes.onclick.should.have.property('value', 't');
  div.removeAttribute('onclick');
  div.attributes.should.not.have.property('onclick');
}

exports.jquery = function() {
  var window = domino.createWindow(html);
  var f = __dirname + '/fixture/jquery-1.9.1.js';
  window._run(fs.readFileSync(f, 'utf8'), f);
  window.$.should.be.ok;
  window.$('.foo').should.have.length(3);
}

exports.treeWalker = function() {
  var window = domino.createWindow(html);
  var d = window.document;
  var root = d.getElementById('tw');
  var tw = d.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  tw.root.should.equal(root);
  tw.currentNode.should.equal(root);
  tw.whatToShow.should.equal(0x4);
  tw.filter.constructor.should.equal(window.NodeFilter.constructor);

  var actual = [];
  while (tw.nextNode() !== null) {
    actual.push(tw.currentNode);
  }

  actual.should.eql([
    root.firstChild.firstChild,
    root.firstChild.lastChild.firstChild,
    root.lastChild.firstChild,
    root.lastChild.lastChild.firstChild
  ]);
}

exports.innerHTML = function() {
  var d = domino.createDocument();
  ['pre','textarea','listing'].forEach(function(elementName) {
    var div = d.createElement('div')
    var el = d.createElement(elementName);
    el.innerHTML = "a";
    div.appendChild(el);
    // no extraneous newline after element tag in this case
    div.innerHTML.should.equal('<'+elementName+'>a</'+elementName+'>');
    el.innerHTML = "\nb";
    // first newline after element is swallowed.  needs two.
    div.innerHTML.should.equal('<'+elementName+'>\n\nb</'+elementName+'>');
  });
}

exports.outerHTML = function() {
  var tests = [
    '<body><pre>\n\na\n</pre></body>',
    '<body bgcolor="white"><h1 style="color: red">\nOne\n2 &amp; 3</h1></body>',
    '<body data-test="<>&amp;&quot;\'"></body>'
  ];
  tests.forEach(function(html) {
    var d = domino.createDocument(html);
    d.body.outerHTML.should.equal(html);
  });
}

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
