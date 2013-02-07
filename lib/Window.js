var DOMImplementation = require('./DOMImplementation');
var Node = require('./Node');
var Document = require('./Document');
var DocumentFragment = require('./DocumentFragment');
var EventTarget = require('./EventTarget');
var Location = require('./Location');
var utils = require('./utils');

module.exports = Window;

function Window(document) {
  this.document = document || new DOMImplementation().createHTMLDocument("");
  this.document._scripting_enabled = true;
  this.document.defaultView = this;
  this.location = new Location(this, "about:blank");
}

Window.prototype = Object.create(EventTarget.prototype, {
  _run: { value: function(code, file) {
    if (file) code += '\n//@ sourceURL=' + file;
    with(this) eval(code);
  }},
  console: { value: console },
  history: { value: {
    back: utils.nyi,
    forward: utils.nyi,
    go: utils.nyi
  }},
  navigator: { value: {
    appName: "node",
    appVersion: "0.1",
    platform: "JavaScript",
    userAgent: "dom"
  }},

  // Self-referential properties
  window: { get: function() { return this; }},
  self: { get: function() { return this; }},
  frames: { get: function() { return this; }},

  // Self-referential properties for a top-level window
  parent: { get: function() { return this; }},
  top: { get: function() { return this; }},

  // We don't support any other windows for now
  length: { value: 0 },           // no frames
  frameElement: { value: null },  // not part of a frame
  opener: { value: null },        // not opened by another window

  // The onload event handler.
  // XXX: need to support a bunch of other event types, too,
  // and have them interoperate with document.body.

  onload: {
    get: function() {
      return this._getEventHandler("load");
    },
    set: function(v) {
      this._setEventHandler("load", v);
    }
  },

  // XXX This is a completely broken implementation
  getComputedStyle: { value: function getComputedStyle(elt) {
    return elt.style;
  }}

});

utils.expose(require('./impl'), Window);
