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
    return el.tagName
  })
  .should.eql(['H2', 'H3', 'H3', 'H2', 'H3'])
}

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

exports.jquery = function() {
  var window = domino.createWindow(html);
  window._run(fs.readFileSync(__dirname + '/fixture/jquery-1.6.2.js', 'utf8'));
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
