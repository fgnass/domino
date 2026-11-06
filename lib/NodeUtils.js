"use strict";
module.exports = {
  // NOTE: The `serializeOne()` function used to live on the `Node.prototype`
  // as a private method `Node#_serializeOne(child)`, however that requires
  // a megamorphic property access `this._serializeOne` just to get to the
  // method, and this is being done on lots of different `Node` subclasses,
  // which puts a lot of pressure on V8's megamorphic stub cache. So by
  // moving the helper off of the `Node.prototype` and into a separate
  // function in this helper module, we get a monomorphic property access
  // `NodeUtils.serializeOne` to get to the function and reduce pressure
  // on the megamorphic stub cache.
  // See https://github.com/fgnass/domino/pull/142 for more information.
  serializeOne: serializeOne
};

var utils = require('./utils');
var NAMESPACE = utils.NAMESPACE;

var hasRawContent = {
  STYLE: true,
  SCRIPT: true,
  XMP: true,
  IFRAME: true,
  NOEMBED: true,
  NOFRAMES: true,
  PLAINTEXT: true
};

// The contents of these elements are RAWTEXT to a browser (for <noscript>,
// when scripting is enabled), which ends them only at their own end tag:
// nothing inside them -- comments, attributes, nested elements -- is markup.
var hasRawContentFallback = {
  IFRAME: true,
  NOEMBED: true,
  NOSCRIPT: true,
  NOFRAMES: true
};

var emptyElements = {
  area: true,
  base: true,
  basefont: true,
  bgsound: true,
  br: true,
  col: true,
  embed: true,
  frame: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true
};

var extraNewLine = {
  /* Removed in https://github.com/whatwg/html/issues/944
  pre: true,
  textarea: true,
  listing: true
  */
};

function escape(s) {
  return s.replace(/[&<>\u00A0]/g, function(c) {
    switch(c) {
    case '&': return '&amp;';
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '\u00A0': return '&nbsp;';
    }
  });
}

function escapeAttr(s) {
  var toEscape = /[&"\u00A0]/g;
  if (!toEscape.test(s)) {
      // nothing to do, fast path
      return s;
  } else {
      return s.replace(toEscape, function(c) {
        switch(c) {
        case '&': return '&amp;';
        case '"': return '&quot;';
        case '\u00A0': return '&nbsp;';
        }
      });
  }
}

// Escape every `</tag` in `content` that a browser would tokenize as an
// end tag for `tag`: one followed by whitespace, '/' or '>' (CR counts,
// since the parser turns it into LF).  We don't need to check the end of
// `content`: it is always followed by our own `</tag>`, and '<' doesn't
// end a tag name.
function escapeClosingTag(content, tag) {
  if (content.indexOf('</') === -1) return content;
  var re = new RegExp('<(/' + tag + '[\\t\\n\\f\\r />])', 'gi');
  return content.replace(re, '&lt;$1');
}

// An HTML parser reads `<?target data?>` as a bogus comment which ends at
// the first '>', so a '>' in `data` must be escaped.
function escapeProcessingInstructionContent(data) {
  return data.indexOf('>') === -1 ? data : data.replace(/>/g, '&gt;');
}

// `<!--data-->` ends early if `data` starts with '>' or '->' (an
// "abrupt closing of empty comment") or contains '-->' or '--!>'.
var CLOSING_COMMENT_RE = /--!?>/;
function escapeClosingCommentTag(data) {
  if (data.charAt(0) === '>') {
    data = '&gt;' + data.slice(1);
  } else if (data.charAt(0) === '-' && data.charAt(1) === '>') {
    data = '-&gt;' + data.slice(2);
  }
  return CLOSING_COMMENT_RE.test(data)
    ? data.replace(/(--!?)>/g, '$1&gt;')
    : data;
}

function attrname(a) {
  var ns = a.namespaceURI;
  if (!ns)
    return a.localName;
  if (ns === NAMESPACE.XML)
    return 'xml:' + a.localName;
  if (ns === NAMESPACE.XLINK)
    return 'xlink:' + a.localName;

  if (ns === NAMESPACE.XMLNS) {
    if (a.localName === 'xmlns') return 'xmlns';
    else return 'xmlns:' + a.localName;
  }
  return a.name;
}

function serializeOne(kid, parent) {
  var s = '';
  switch(kid.nodeType) {
    case 1: //ELEMENT_NODE
      var ns = kid.namespaceURI;
      var html = ns === NAMESPACE.HTML;
      var tagname = (html || ns === NAMESPACE.SVG || ns === NAMESPACE.MATHML) ? kid.localName : kid.tagName;

      s += '<' + tagname;

      for(var j = 0, k = kid._numattrs; j < k; j++) {
        var a = kid._attr(j);
        s += ' ' + attrname(a);
        if (a.value !== undefined) s += '="' + escapeAttr(a.value) + '"';
      }
      s += '>';

      if (!(html && emptyElements[tagname])) {
        var ss = kid.serialize();
        if (html && extraNewLine[tagname] && ss.charAt(0)==='\n') s += '\n';
        if (html && hasRawContentFallback[tagname.toUpperCase()]) {
          ss = escapeClosingTag(ss, tagname);
        }
        // Serialize children and add end tag for all others
        s += ss;
        s += '</' + tagname + '>';
      }
      break;
    case 3: //TEXT_NODE
    case 4: //CDATA_SECTION_NODE
      var parenttag;
      if (parent.nodeType === 1 /*ELEMENT_NODE*/ &&
        parent.namespaceURI === NAMESPACE.HTML)
        parenttag = parent.tagName;
      else
        parenttag = '';

      if (hasRawContent[parenttag] ||
          (parenttag==='NOSCRIPT' && parent.ownerDocument._scripting_enabled)) {
        s += kid.data;
      } else {
        s += escape(kid.data);
      }
      break;
    case 8: //COMMENT_NODE
      s += '<!--' + escapeClosingCommentTag(kid.data) + '-->';
      break;
    case 7: //PROCESSING_INSTRUCTION_NODE
      s += '<?' + kid.target + ' ' +
        escapeProcessingInstructionContent(kid.data) + '?>';
      break;
    case 10: //DOCUMENT_TYPE_NODE
      s += '<!DOCTYPE ' + kid.name;

      if (false) {
        // Latest HTML serialization spec omits the public/system ID
        if (kid.publicID) {
          s += ' PUBLIC "' + kid.publicId + '"';
        }

        if (kid.systemId) {
          s += ' "' + kid.systemId + '"';
        }
      }

      s += '>';
      break;
    default:
      utils.InvalidStateError();
  }
  return s;
}
