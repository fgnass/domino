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

// The four "fallback raw content" elements: their contents are RAWTEXT to a
// browser's HTML tokenizer (when scripting is enabled, for <noscript>), and
// can *only* be terminated by a literal end tag matching the element's own
// name -- not by any nested markup, comment, or processing-instruction
// syntax. See https://html.spec.whatwg.org/multipage/parsing.html
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

// Walk up from `node` collecting the (lowercase) tag names of every
// enclosing "fallback raw content" element (<noscript>, <iframe>,
// <noembed>, <noframes>), so callers can escape a matching closing tag
// wherever it appears in raw-emitted content underneath them.
//
// Crosses <template> boundaries: per the DOM, template.content is a
// DocumentFragment whose parentNode is null, so a plain parentNode walk
// would stop there and miss an enclosing fallback element outside the
// <template>. HTMLTemplateElement stamps a `_host` back-reference onto
// its content fragment (see htmlelts.js) so we can continue upward.
function fallbackRawContentTags(node) {
  var tags = [];
  while (node) {
    if (node.nodeType === 1 /*ELEMENT_NODE*/) {
      if (node.namespaceURI === NAMESPACE.HTML && hasRawContentFallback[node.tagName]) {
        tags.push(node.localName);
      }
      node = node.parentNode;
    } else if (node.nodeType === 11 /*DOCUMENT_FRAGMENT_NODE*/ && node._host) {
      node = node._host;
    } else {
      node = node.parentNode;
    }
  }
  return tags;
}

// Escape the '<' of every occurrence of `</tag` in `content` (case
// insensitively, and only when followed by a valid HTML end-tag-name
// terminator: tab/LF/FF/space, '/', or '>') so it can no longer be
// tokenized as that tag's end tag.
//
// Deliberately does NOT treat end-of-string as a valid terminator: at
// every call site, `content` is a fragment that domino always follows
// with more of its own literal output (another '<...' tag, or a '?>'/
// '-->' close sequence) -- never truly nothing -- and none of those
// following characters are a valid terminator either. Matching on
// end-of-string would therefore both escape sequences a real browser
// would never treat as a closing tag, and (as HTML5 has several
// "half-open tag" and script-data-double-escaped parsing states that
// react to what a partial `</tag` is *not* followed by) risk disagreeing
// with real HTML parsing behavior for a tag name that merely happens to
// end this particular fragment.
function escapeMatchingClosingTag(content, tag) {
  if (content.indexOf('<') === -1) return content;
  var re = new RegExp('<(/' + tag + '[\\t\\n\\f />])', 'gi');
  return content.replace(re, '&lt;$1');
}

// Escape any ancestor fallback-raw-content element's closing tag found in
// `content`, given the element `parent` that `content` is about to be
// serialized underneath.
function escapeAncestorFallbackClosingTags(content, parent) {
  if (content.indexOf('</') === -1) return content;
  var fallbackTags = fallbackRawContentTags(parent);
  for (var i = 0; i < fallbackTags.length; i++) {
    content = escapeMatchingClosingTag(content, fallbackTags[i]);
  }
  return content;
}

// A ProcessingInstruction (`<?target data?>`) is tokenized by a browser's
// HTML parser as a "bogus comment": the token runs from '<?' up to the
// very first '>' it finds, no matter what. Domino always appends a
// literal '?>' of its own, so if `data` itself contains an unescaped '>',
// the bogus comment closes early and everything after it - including any
// literal markup smuggled in as PI "data" - is parsed as live HTML.
// createProcessingInstruction() already rejects a literal '?>' in data,
// but a lone '>' is allowed and must be escaped here.
function escapeProcessingInstructionContent(data) {
  return data.indexOf('>') === -1 ? data : data.replace(/>/g, '&gt;');
}

// A Comment (`<!--data-->`) that starts with '>' or '->' hits the HTML5
// tokenizer's "abrupt-closing-of-empty-comment" state and terminates
// immediately at that character, turning the rest of `data` into live
// markup (e.g. `#comment('><img onerror=alert(1) src=x>')` would
// otherwise serialize to `<!--><img onerror=alert(1) src=x>-->`, which
// parses as an empty comment followed by a real, executing <img>). Any
// other unescaped `-->` (or the legacy `--!>`) inside `data` closes the
// comment early the same way.
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
        // A raw-content element's children (e.g. a text node directly
        // inside <style>/<script>/<xmp>) are serialized verbatim, with no
        // escaping at all -- matching real browsers, which never escape
        // <script>/<style>/<xmp>/<plaintext> text either, even if it
        // contains what looks like that same element's own closing tag
        // (that's an existing, spec-defined round-tripping gap that is
        // not novel here and is not this fix's concern). But if this
        // raw-content element is itself nested under a fallback
        // raw-content ancestor (<noscript>, <iframe>, <noembed>,
        // <noframes>), a browser parsing the *ancestor's* RAWTEXT content
        // is not even looking for this element's tags at all -- only for
        // the ancestor's own closing tag -- so a matching sequence buried
        // in here would terminate the ancestor's container early instead.
        // Escape only that.
        var upperTag = html ? tagname.toUpperCase() : '';
        if (hasRawContent[upperTag] && !hasRawContentFallback[upperTag] && ss.indexOf('</') !== -1) {
          ss = escapeAncestorFallbackClosingTags(ss, parent);
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
        // Raw content is emitted verbatim (matching real browsers, which
        // never escape <script>/<style>/<xmp>/... text either) -- except
        // for a closing tag matching an enclosing fallback raw-content
        // element (<noscript>, <iframe>, <noembed>, <noframes>), which
        // must be escaped or it terminates that ancestor's RAWTEXT
        // container early. See escapeAncestorFallbackClosingTags().
        s += escapeAncestorFallbackClosingTags(kid.data, parent);
      } else {
        s += escape(kid.data);
      }
      break;
    case 8: //COMMENT_NODE
      // Same ordering rationale as the ProcessingInstruction case below:
      // check the ancestor closing tag against the original data first.
      var commentData = escapeAncestorFallbackClosingTags(kid.data, parent);
      commentData = escapeClosingCommentTag(commentData);
      s += '<!--' + commentData + '-->';
      break;
    case 7: //PROCESSING_INSTRUCTION_NODE
      // Order matters: escape the ancestor closing tag first, against the
      // original data, so the end-tag-terminator boundary check (the
      // character right after the tag name) sees the real, unmodified
      // '>' rather than an already-escaped '&gt;' that would no longer
      // look like a valid terminator to the regex.
      var piData = escapeAncestorFallbackClosingTags(kid.data, parent);
      piData = escapeProcessingInstructionContent(piData);
      s += '<?' + kid.target + ' ' + piData + '?>';
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
