/**
 * Zest (https://github.com/chjj/zest)
 * A css selector engine.
 * Copyright (c) 2011, Christopher Jeffrey. (MIT Licensed)
 */

/**
 * Helpers
 */

function order(a, b) {
  return a.compareDocumentPosition(b) & 2 ? 1 : -1;
}

function next(el) {
  while ((el = el.nextSibling) && el.nodeType !== 1);
  return el;
}

function prev(el) {
  while ((el = el.previousSibling) && el.nodeType !== 1);
  return el;
}

function child(el) {
  if ((el = el.firstChild)) {
    while (el.nodeType !== 1 && (el = el.nextSibling));
  }
  return el;
}

function unquote(str) {
  if (!str) return str;
  var ch = str[0];
  return (ch === '"' || ch === "'") ? str.slice(1, -1) : str;
}

function makeInside(end) {
  var inside = /(?:"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\\["'_]|[^"'_])+/;
  var ins = inside.source.replace(/_/g, end);
  return new RegExp(ins);
}

function replace(regex, name, val) {
  regex = regex.source;
  regex = regex.replace(name, val.source || val);
  return new RegExp(regex);
}

/**
 * Handle `nth` Selectors
 */

var nth = function(param, test) {
  var $ = param.replace(/\s+/g, '');
  var offset;
  var group;

  if ($ === 'even') $ = '2n+0';
  else if ($ === 'odd') $ = '2n+1';
  else if (!~$.indexOf('n')) $ = '0n' + $;

  $ = /^([+-])?(\d+)?n([+-])?(\d+)?$/.exec($);
  group = $[1] === '-' ? -($[2] || 1) : +($[2] || 1);
  offset = $[4] ? ($[3] === '-' ? -$[4] : +$[4]) : 0;
  $ = param = undefined;

  return function(el) {
    if (el.parentNode.nodeType !== 1) return;

    var rel = child(el.parentNode);
    var pos = 0;
    var diff;

    while (rel) {
      if (test(rel, el)) pos++;
      if (rel === el) {
        diff = pos - offset;
        return !group ? !diff : !(diff % group);
      }
      rel = next(rel);
    }
  };
};

/**
 * Simple Selectors
 */

var selectors = {
  '*': function() {
    return true;
  },
  type: function(type) {
    type = type.toLowerCase();
    return function(el) {
      return el.nodeName.toLowerCase() === type;
    };
  },
  attr: function(key, op, val) {
    op = operators[op];
    return function(el) {
      var attr;
      var v;
      if (el.nodeType == 1) {
        if (key == 'for')
          attr = el.htmlFor;
        else if (key == 'class')
          attr = el.className;
        else if (key == 'href')
          attr = el.getAttribute('href', 2);
        else if (key == 'title')
          attr = el.getAttribute('title') || null; // because technically '' is not null
        else {
          v = el[key];
          attr = v !== undefined ? v : el.getAttribute(key);
        }
      }
      return attr != null && op(attr + '', val);
    };
  },
  ':first-child': function(el) {
    return !prev(el) && el.parentNode.nodeType === 1;
  },
  ':last-child': function(el) {
    return !next(el) && el.parentNode.nodeType === 1;
  },
  ':only-child': function(el) {
    return (!prev(el) && !next(el)) && el.parentNode.nodeType === 1;
  },
  ':nth-child': function(param) {
    return nth(param, function() {
      return true;
    });
  },
  ':root': function(el) {
    return el.ownerDocument.documentElement === el;
  },
  ':empty': function(el) {
    return !el.firstChild;
  },
  ':not': function(sel) {
    var test = compile(sel);
    return function(el) {
      return !test(el);
    };
  },
  ':first-of-type': function(el) {
    if (el.parentNode.nodeType !== 1) return;
    var type = el.nodeName;
    while ((el = prev(el))) {
      if (el.nodeName === type) return;
    }
    return true;
  },
  ':last-of-type': function(el) {
    if (el.parentNode.nodeType !== 1) return;
    var type = el.nodeName;
    while ((el = next(el))) {
      if (el.nodeName === type) return;
    }
    return true;
  },
  ':nth-last-of-type': function(param) {
  },
  ':only-of-type': function(el) {
    return selectors[':first-of-type'](el) && selectors[':last-of-type'](el);
  },
  ':nth-of-type': function(param) {
    return nth(param, function(rel, el) {
      return rel.nodeName === el.nodeName;
    });
  },
  ':checked': function(el) {
    return !!(el.checked || el.selected);
  },
  ':indeterminate': function(el) {
    return !selectors[':checked'](el);
  },
  ':enabled': function(el) {
    return !el.disabled && el.type !== 'hidden';
  },
  ':disabled': function(el) {
    return !!el.disabled;
  },
  ':focus': function(el) {
    return el === el.ownerDocument.activeElement;
  },
  ':matches': function(sel) {
    var test = compile(sel);
    return function(el) {
      return test(el);
    };
  },
  ':nth-match': function(param) {
    var args = param.split(/\s*,\s*/);
    var p = args.pop()
    var test = compile(args.join(','));

    return nth(p, test);
  },
  ':lang': function(param) {
    return function(el) {
      while (el) {
        if (el.lang) return el.lang.indexOf(param) === 0;
        el = el.parentNode;
      }
    };
  },
  ':dir': function(param) {
    return function(el) {
      while (el) {
        if (el.dir) return el.dir === param;
        el = el.parentNode;
      }
    };
  },
  ':scope': function(el) {
    if (context.nodeType === 9) {
      return el === context.documentElement;
    }
    return el === context;
  },
  ':any-link': function(el) {
    return el.nodeName === 'A';
  },
  ':current': function(el) {
  },
  ':past': function(el) {
  },
  ':future': function(el) {
  },
  ':default': function(el) {
  },
  ':valid': function(el) {
  },
  ':invalid': function(el) {
  },
  ':in-range': function(el) {
    return el.value > el.min && el.value <= el.max;
  },
  ':out-of-range': function(el) {
    return !selectors[':in-range'](el);
  },
  ':required': function(el) {
    return !!el.required;
  },
  ':optional': function(el) {
    return !el.required;
  },
  ':read-only': function(el) {
    return !!el.readOnly;
  },
  ':read-write': function(el) {
    return !el.readOnly;
  },
  ':column': function(el) {
    return function() {};
  },
  ':nth-column': function(el) {
    return function() {};
  },
  ':nth-last-column': function(el) {
    return function() {};
  },
  /*
  ':target': function(el) {
    return el.id === window.location.hash.substring(1);
  },
  ':links-here': function(el) {
    return el + '' === window.location + '';
  },
  ':local-link': function(el) {
    return el.href && el.host === window.location.host;
  },
  ':subject': function(el) {
    subject = el;
    return true;
  }
  */
};

/**
 * Attribute Operators
 */

var operators = {
  '-': function() {
    return true;
  },
  '=': function(attr, val) {
    return attr === val;
  },
  '!=': function(attr, val) {
    return attr !== val;
  },
  '*=': function(attr, val) {
    return attr.indexOf(val) !== -1;
  },
  '~=': function(attr, val) {
    var i = attr.indexOf(val);
    var f;
    var l;

    if (i === -1) return;
    f = attr[i - 1];
    l = attr[i + val.length];

    return (!f || f === ' ') && (!l || l === ' ');
  },
  '|=': function(attr, val) {
    var i = attr.indexOf(val);
    var l;

    if (i !== 0) return;
    l = attr[i + val.length];

    return l === '-' || !l;
  },
  '^=': function(attr, val) {
    return attr.indexOf(val) === 0;
  },
  '$=': function(attr, val) {
    return attr.indexOf(val) + val.length === attr.length;
  }
};

/**
 * Combinator Logic
 */

var combinators = {
  ' ': function(test) {
    return function(el) {
      while ((el = el.parentNode)) {
        if (test(el)) return el;
      }
    };
  },
  '>': function(test) {
    return function(el) {
      return test(el = el.parentNode) && el;
    };
  },
  '+': function(test) {
    return function(el) {
      return test(el = prev(el)) && el;
    };
  },
  '~': function(test) {
    return function(el) {
      while ((el = prev(el))) {
        if (test(el)) return el;
      }
    };
  },
  'noop': function(test) {
    return function(el) {
      return test(el) && el;
    };
  },
  '//': function(test, name) {
    return function(el) {
      var e = document.getElementsByTagName('*'); // can't recurse zest
      var i = e.length;
      var attr;

      while (i--) {
        attr = e[i].getAttribute(name);
        if (!attr) continue;
        if (attr[0] === '#') attr = attr.substring(1);
        if (el.id === attr && test(el)) return true;
      }

      return false;
    };
  }
};

/**
 * Parsing
 */


var attr = /^\[([\w\-]+)(?:([^\w]?=)(value))?\]/;
attr = replace(attr, 'value', makeInside('\\]'));

var paren = /^(:[\w\-]+)\((value)\)/;
paren = replace(paren, 'value', makeInside(')'));

var parse = function parse(sel) {
  if (sel.length > 1) {
    var func = [];
    var i = 0;
    var l = sel.length;

    for (; i < l; i++) {
      func.push(parse.string(sel[i]));
    }

    l = func.length;
    return function(el) {
      for (i = 0; i < l; i++) {
        if (!func[i](el)) return;
      }
      return true;
    };
  }
  return sel[0] === '*' ? selectors['*'] : selectors.type(sel[0]);
};

parse.string = function(sel) {
  var cap, param;
  switch (sel[0]) {
    case '.': return selectors.attr('class', '~=', sel.substring(1));
    case '#': return selectors.attr('id', '=', sel.substring(1));
    case '[': cap = attr.exec(sel);
              return cap && selectors.attr(cap[1], cap[2] || '-', unquote(cap[3]));
    case ':': cap = paren.exec(sel);
              if (cap) sel = cap[1], param = unquote(cap[2]);
              return param ? selectors[sel](param) : selectors[sel];
    case '*': return selectors['*'];
    default:  return selectors.type(sel);
  }
};

/**
 * Compiling
 */

var rules = {
  subject: /^ *\$/,
  qname: /^ *(\w+|\*)/,
  simple: /^([.#][\w\-]+|:[\w\-]+(?:\(inside\))?|\[inside\])/,
  combinator: /^(?: +([^ \w*]) +|( )+|([^ \w*]))(?! *$)/
};

rules.simple = replace(rules.simple, 'inside', makeInside(')'));
rules.simple = replace(rules.simple, 'inside', makeInside('\\]'));

var compile = function(sel) {
  sel = sel.replace(/^\s+|\s+$/g, '');

  var filter = [];
  var buff = [];
  var comb;
  var qname;
  var cap;
  var op;

  while (sel) {
    // if (cap = rules.subject.exec(sel)) {
    //   sel = sel.substring(cap[0].length);
    //   buff.push(':subject');
    //   subject = true;
    // }

    if ((cap = rules.qname.exec(sel))) {
      sel = sel.substring(cap[0].length);
      qname = cap[1];
      buff.push(qname);
    }
    else if ((cap = rules.simple.exec(sel))) {
      sel = sel.substring(cap[0].length);
      qname = '*';
      buff.push(qname);
      buff.push(cap[1]);
    }
    else {
      break;
    }

    while ((cap = rules.simple.exec(sel))) {
      sel = sel.substring(cap[0].length);
      buff.push(cap[1]);
    }

    if ((cap = rules.combinator.exec(sel))) {
      sel = sel.substring(cap[0].length);
      op = cap[1] || cap[2] || cap[3];
      comb = combinators[op];
    }
    else {
      comb = combinators.noop;
    }

    filter.push(comb(parse(buff)));

    buff = [];
  }

  filter = compile.make(filter);
  filter.qname = qname;

  return filter;
};

compile.make = function(func) {
  return function(el) {
    var i = func.length;
    while (i--) {
      if (!(el = func[i](el))) return;
    }
    return true;
  };
};

/**
 * Selection
 */

var select = function(sel, context) {
  var results = [];
  var i = 0;
  var scope;
  var el;

  if (~sel.indexOf(',')) {
    var group = sel.split(/,\s*(?![^\[]*\])/);
    var k;
    sel = undefined;

    // prevent stack overflow
    if (group.length < 2) {
      sel = group[0];
    }
    else {
      while ((sel = group[i++])) {
        scope = select(sel, context);
        k = 0;
        while ((el = scope[k++])) {
          if (!~results.indexOf(el)) {
            results.push(el);
          }
        }
      }
      results.sort(order);
      return results;
    }
  }

  var test = compile(sel);
  scope = context.getElementsByTagName(test.qname);
  i = 0;

  /*
  if (subject) {
    while ((el = scope[i++])) {
      if (test(el) && !~results.indexOf(subject))
        results.push(subject);
    }
  }
  else {
  */

  while ((el = scope[i++])) {
    if (test(el)) results.push(el);
  }

  //subject = null;
  return results;
};

/**
 * Expose
 */

module.exports = exports = function(sel, context) {
  if (!~sel.indexOf(' ')) {
    if (sel[0] === '#' && context.rooted && /^#\w+$/.test(sel)) {
      return [context.doc.getElementById(sel.substring(1))];
    }
    if (sel[0] === '.' && /^\.\w+$/.test(sel)) {
      return context.getElementsByClassName(sel.substring(1));
    }
    if (/^\w+$/.test(sel)) {
      return context.getElementsByTagName(sel);
    }
  }
  return select(sel, context);
};

exports.selectors = selectors;
exports.operators = operators;
exports.combinators = combinators;

exports.matches = function(el, sel) {
  return !!compile(sel)(el);
};


