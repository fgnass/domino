"use strict";
// DOMTokenList implementation based on https://github.com/Raynos/DOM-shim
var utils = require('./utils');

module.exports = DOMTokenList;

function DOMTokenList(getter, setter) {
  this._getString = getter;
  this._setString = setter;
  fixIndex(this, getList(this));
}

Object.defineProperties(DOMTokenList.prototype, {
  item: { value: function(index) {
    if (index >= this.length) {
      return null;
    }
    return getList(this)[index];
  }},

  contains: { value: function(token) {
    token = String(token); // no error checking for contains()
    var list = getList(this);
    return list.indexOf(token) > -1;
  }},

  add: { value: function() {
    for (var i = 0, len = arguments.length; i < len; i++) {
      var token = handleErrors(arguments[i]);
      var list = getList(this);
      if (list.indexOf(token) > -1) {
        return;
      }
      list.push(token);
      this._setString(list.join(" ").trim());
      fixIndex(this, list);
    }
  }},

  remove: { value: function() {
    for (var i = 0, len = arguments.length; i < len; i++) {
      var token = handleErrors(arguments[i]);
      var list = getList(this);
      var index = list.indexOf(token);
      if (index > -1) {
        list.splice(index, 1);
        this._setString(list.join(" ").trim());
      }
      fixIndex(this, list);
    }
  }},

  toggle: { value: function toggle(token, force) {
    token = handleErrors(token);
    if (this.contains(token)) {
      if (force === undefined || force === false) {
        this.remove(token);
        return false;
      }
      return true;
    } else {
      if (force === undefined || force === true) {
        this.add(token);
        return true;
      }
      return false;
    }
  }},

  replace: { value: function replace(token, newToken) {
    token = handleErrors(token);
    newToken = handleErrors(newToken);
    var list = getList(this);
    var idx = list.indexOf(token);
    if (idx < 0) {
      return false;
    }
    list[idx] = newToken;
    this._setString(list.join(" ").trim());
    fixIndex(this, list);
    return true;
  }},

  toString: { value: function() {
    return this._getString();
  }},

  value: {
    get: function() {
      return this._getString();
    },
    set: function(v) {
      this._setString(v);
      fixIndex(this, getList(this));
    }
  },
});

function fixIndex(clist, list) {
  clist.length = list.length;
  for (var i = 0; i < list.length; i++) {
    clist[i] = list[i];
  }
}

function handleErrors(token) {
  token = String(token);
  if (token === "") {
    utils.SyntaxError();
  }
  if (/[ \t\r\n\f]/.test(token)) {
    utils.InvalidCharacterError();
  }
  return token;
}

function getList(clist) {
  var str = clist._getString().replace(/(^[ \t\r\n\f]+)|([ \t\r\n\f]+$)/g, '');
  if (str === "") {
    return [];
  } else {
    return str.split(/[ \t\r\n\f]+/g);
  }
}
