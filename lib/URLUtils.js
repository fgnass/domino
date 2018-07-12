"use strict";
var URL = require('./URL');

module.exports = URLUtils;

// Allow the `x == null` pattern.  This is eslint's "null: 'ignore'" option,
// but jshint doesn't support this.
/* jshint eqeqeq: false */

// This is an abstract superclass for Location, HTMLAnchorElement and
// other types that have the standard complement of "URL decomposition
// IDL attributes".  This is now standardized as URLUtils, see:
// https://url.spec.whatwg.org/#urlutils
// Subclasses must define a getter/setter on href.
// The getter and setter methods parse and rebuild the URL on each
// invocation; there is no attempt to cache the value and be more efficient
function URLUtils() {}
URLUtils.prototype = {
  constructor: URLUtils,

  get _url() {
    // XXX: this should do the "Reinitialize url" steps, and "null" should
    // be a valid return value.
    return new URL(this.href);
  },

  get protocol() {
    var url = this._url;
    if (url && url.scheme) return url.scheme + ":";
    else return ":";
  },

  get host() {
    var url = this._url;
    if (url.isAbsolute() && url.isAuthorityBased())
      return url.host + (url.port ? (":" + url.port) : "");
    else
      return "";
  },

  get hostname() {
    var url = this._url;
    if (url.isAbsolute() && url.isAuthorityBased())
      return url.host;
    else
      return "";
  },

  get port() {
    var url = this._url;
    if (url.isAbsolute() && url.isAuthorityBased() && url.port!==undefined)
      return url.port;
    else
      return "";
  },

  get pathname() {
    var url = this._url;
    if (url.isAbsolute() && url.isHierarchical())
      return url.path;
    else
      return "";
  },

  get search() {
    var url = this._url;
    if (url.isAbsolute() && url.isHierarchical() && url.query!==undefined)
      return "?" + url.query;
    else
      return "";
  },

  get hash() {
    var url = this._url;
    if (url == null || url.fragment == null || url.fragment === '') {
      return "";
    } else {
      return "#" + url.fragment;
    }
  },

  get username() {
    var url = this._url;
    return url.username || '';
  },

  get password() {
    var url = this._url;
    return url.password || '';
  },

  get origin() {
    var url = this._url;
    if (url == null) { return ''; }
    var originForPort = function(defaultPort) {
      var origin = [url.scheme, url.host, +url.port || defaultPort];
      // XXX should be "unicode serialization"
      return origin[0] + '://' + origin[1] +
        (origin[2] === defaultPort ? '' : (':' + origin[2]));
    };
    switch (url.scheme) {
    case 'ftp':
      return originForPort(21);
    case 'gopher':
      return originForPort(70);
    case 'http':
    case 'ws':
      return originForPort(80);
    case 'https':
    case 'wss':
      return originForPort(443);
    default:
      // this is what chrome does
      return url.scheme + '://';
    }
  },

  /*
  get searchParams() {
    var url = this._url;
    // XXX
  },
  */

  set protocol(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute()) {
      v = v.replace(/:+$/, "");
      v = v.replace(/[^-+\.a-zA-Z0-9]/g, URL.percentEncode);
      if (v.length > 0) {
        url.scheme = v;
        output = url.toString();
      }
    }
    this.href = output;
  },

  set host(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute() && url.isAuthorityBased()) {
      v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-Z0-9]/g, URL.percentEncode);
      if (v.length > 0) {
        url.host = v;
        delete url.port;
        output = url.toString();
      }
    }
    this.href = output;
  },

  set hostname(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute() && url.isAuthorityBased()) {
      v = v.replace(/^\/+/, "");
      v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-Z0-9]/g, URL.percentEncode);
      if (v.length > 0) {
        url.host = v;
        output = url.toString();
      }
    }
    this.href = output;
  },

  set port(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute() && url.isAuthorityBased()) {
      v = '' + v;
      v = v.replace(/[^0-9].*$/, "");
      v = v.replace(/^0+/, "");
      if (v.length === 0) v = "0";
      if (parseInt(v, 10) <= 65535) {
        url.port = v;
        output = url.toString();
      }
    }
    this.href = output;
  },

  set pathname(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute() && url.isHierarchical()) {
      if (v.charAt(0) !== "/")
        v = "/" + v;
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/a-zA-Z0-9]/g, URL.percentEncode);
      url.path = v;
      output = url.toString();
    }
    this.href = output;
  },

  set search(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute() && url.isHierarchical()) {
      if (v.charAt(0) === "?") v = v.substring(1);
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-Z0-9]/g, URL.percentEncode);
      url.query = v;
      output = url.toString();
    }
    this.href = output;
  },

  set hash(v) {
    var output = this.href;
    var url = new URL(output);

    if (v.charAt(0) === "#") v = v.substring(1);
    v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-Z0-9]/g, URL.percentEncode);
    url.fragment = v;
    output = url.toString();

    this.href = output;
  },

  set username(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute()) {
      v = v.replace(/[\x00-\x1F\x7F-\uFFFF "#<>?`\/@\\:]/g, URL.percentEncode);
      url.username = v;
      output = url.toString();
    }
    this.href = output;
  },

  set password(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute()) {
      if (v==='') {
        url.password = null;
      } else {
        v = v.replace(/[\x00-\x1F\x7F-\uFFFF "#<>?`\/@\\]/g, URL.percentEncode);
        url.password = v;
      }
      output = url.toString();
    }
    this.href = output;
  }/*,

  set searchParams(v) {
    var output = this.href;
    var url = new URL(output);
    // XXX
    this.href = output;
  }
  */
};

URLUtils._inherit = function(proto) {
  // copy getters/setters from URLUtils to o.
  Object.getOwnPropertyNames(URLUtils.prototype).forEach(function(p) {
    if (p==='constructor' || p==='href') { return; }
    var desc = Object.getOwnPropertyDescriptor(URLUtils.prototype, p);
    Object.defineProperty(proto, p, desc);
  });
};
