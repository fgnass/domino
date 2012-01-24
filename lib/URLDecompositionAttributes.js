var URL = require('./URL');

module.exports = URLDecompositionAttributes;

// This is an abstract superclass for Location, HTMLAnchorElement and
// other types that have the standard complement of "URL decomposition
// IDL attributes".
// Subclasses must define getInput() and setOutput() methods.
// The getter and setter methods parse and rebuild the URL on each
// invocation; there is no attempt to cache the value and be more efficient
function URLDecompositionAttributes() {}
URLDecompositionAttributes.prototype = {
  constructor: URLDecompositionAttributes,

  get protocol() {
    var url = new URL(this.getInput());
    if (url.isAbsolute()) return url.scheme + ":";
    else return "";
  },

  get host() {
    var url = new URL(this.getInput());
    if (url.isAbsolute() && url.isAuthorityBased())
      return url.host + (url.port ? (":" + url.port) : "");
    else
      return "";
  },

  get hostname() {
    var url = new URL(this.getInput());
    if (url.isAbsolute() && url.isAuthorityBased())
      return url.host;
    else
      return "";
  },

  get port() {
    var url = new URL(this.getInput());
    if (url.isAbsolute() && url.isAuthorityBased() && url.port!==undefined)
      return url.port;
    else
      return "";
  },

  get pathname() {
    var url = new URL(this.getInput());
    if (url.isAbsolute() && url.isHierarchical())
      return url.path;
    else
      return "";
  },

  get search() {
    var url = new URL(this.getInput());
    if (url.isAbsolute() && url.isHierarchical() && url.query!==undefined)
      return "?" + url.query;
    else
      return "";
  },

  get hash() {
    var url = new URL(this.getInput());
    if (url.isAbsolute() && url.fragment != undefined)
      return "#" + url.fragment;
    else
      return "";
  },


  set protocol(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute()) {
      v = v.replace(/:+$/, "");
      v = v.replace(/[^-+\.a-zA-z0-9]/g, URL.percentEncode);
      if (v.length > 0) {
        url.scheme = v;
        output = url.toString();
      }
    }
    this.setOutput(output);
  },

  set host(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute() && url.isAuthorityBased()) {
      v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-z0-9]/g, URL.percentEncode);
      if (v.length > 0) {
        url.host = v;
        delete url.port;
        output = url.toString();
      }
    }
    this.setOutput(output);
  },

  set hostname(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute() && url.isAuthorityBased()) {
      v = v.replace(/^\/+/, "");
      v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-z0-9]/g, URL.percentEncode);
      if (v.length > 0) {
        url.host = v;
        output = url.toString();
      }
    }
    this.setOutput(output);
  },

  set port(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute() && url.isAuthorityBased()) {
      v = v.replace(/[^0-9].*$/, "");
      v = v.replace(/^0+/, "");
      if (v.length === 0) v = "0";
      if (parseInt(v, 10) <= 65535) {
        url.port = v;
        output = url.toString();
      }
    }
    this.setOutput(output);
  },

  set pathname(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute() && url.isHierarchical()) {
      if (v.charAt(0) !== "/")
        v = "/" + v;
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/a-zA-z0-9]/g, URL.percentEncode);
      url.path = v;
      output = url.toString();
    }
    this.setOutput(output);
  },

  set search(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute() && url.isHierarchical()) {
      if (v.charAt(0) !== "?") v = v.substring(1);
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-z0-9]/g, URL.percentEncode);
      url.query = v;
      output = url.toString();
    }
    this.setOutput(output);
  },

  set hash(v) {
    var output = this.getInput();
    var url = new URL(output);
    if (url.isAbsolute()) {
      if (v.charAt(0) !== "#") v = v.substring(1);
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-z0-9]/g, URL.percentEncode);
      url.fragment = v;
      output = url.toString();
    }
    this.setOutput(output);
  }
};
