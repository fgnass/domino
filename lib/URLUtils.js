var URL = require('./URL');

module.exports = URLUtils;

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

  get protocol() {
    var url = new URL(this.href);
    if (url.isAbsolute()) return url.scheme + ":";
    else return "";
  },

  get host() {
    var url = new URL(this.href);
    if (url.isAbsolute() && url.isAuthorityBased())
      return url.host + (url.port ? (":" + url.port) : "");
    else
      return "";
  },

  get hostname() {
    var url = new URL(this.href);
    if (url.isAbsolute() && url.isAuthorityBased())
      return url.host;
    else
      return "";
  },

  get port() {
    var url = new URL(this.href);
    if (url.isAbsolute() && url.isAuthorityBased() && url.port!==undefined)
      return url.port;
    else
      return "";
  },

  get pathname() {
    var url = new URL(this.href);
    if (url.isAbsolute() && url.isHierarchical())
      return url.path;
    else
      return "";
  },

  get search() {
    var url = new URL(this.href);
    if (url.isAbsolute() && url.isHierarchical() && url.query!==undefined)
      return "?" + url.query;
    else
      return "";
  },

  get hash() {
    var url = new URL(this.href);
    if (url.isAbsolute() && url.fragment != undefined)
      return "#" + url.fragment;
    else
      return "";
  },

  get username() {
    var url = new URL(this.href);
    return url.username || '';
  },

  get password() {
    var url = new URL(this.href);
    return url.password || '';
  },

  get origin() {
    var url = new URL(this.href);
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
      return originForPort(80);
    default:
      // this is what chrome does
      return url.scheme + '://';
    }
  },

  /*
  get searchParams() {
    var url = new URL(this.href);
    // XXX
  },
  */

  set protocol(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute()) {
      v = v.replace(/:+$/, "");
      v = v.replace(/[^-+\.a-zA-z0-9]/g, URL.percentEncode);
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
      v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-z0-9]/g, URL.percentEncode);
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
      v = v.replace(/[^-+\._~!$&'()*,;:=a-zA-z0-9]/g, URL.percentEncode);
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
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/a-zA-z0-9]/g, URL.percentEncode);
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
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-z0-9]/g, URL.percentEncode);
      url.query = v;
      output = url.toString();
    }
    this.href = output;
  },

  set hash(v) {
    var output = this.href;
    var url = new URL(output);
    if (url.isAbsolute()) {
      if (v.charAt(0) === "#") v = v.substring(1);
      v = v.replace(/[^-+\._~!$&'()*,;:=@\/?a-zA-z0-9]/g, URL.percentEncode);
      url.fragment = v;
      output = url.toString();
    }
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
