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
