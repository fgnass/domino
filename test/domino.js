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

exports.children = function() {
  var d = domino.createDocument(html);
  var c = d.body.children;
  c.should.have.length(3);
  c.should.have.property(0);
  var a = Array.prototype.slice.call(c);
  a.should.be.an.instanceof(Array);
  a.should.have.length(3);
  d.body.appendChild(d.createElement('p'));
  a = Array.prototype.slice.call(c);
  a.should.have.length(4);
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
