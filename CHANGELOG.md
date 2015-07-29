# domino 1.0.19 (29 Jul 2015)
* Bug fixes for `TreeWalker` / `document.createTreeWalker` (filter
  argument was ignored; various traversal issues)
* Implement `NodeIterator` / `document.createNodeIterator` (#54)
* Update `mocha` dependency to 2.2.x and `should` to 7.0.x.

# domino 1.0.18 (25 Sep 2014)
* HTMLAnchorElement now implements URLUtils. (#47)
* Be consistent with our handling of null/empty namespaces. (#48)
* Update `mocha` dependency to 1.21.x and `should` to 4.0.x.

# domino 1.0.17 (14 May 2014)
* Brown paper bag bug fix for an HTML parsing regression introduced in
  domino 1.0.16. (#45)
* Update `mocha` dependency to 1.18.x and `should` to 3.3.x.

# domino 1.0.16 (13 May 2014)
**DO NOT USE:** contains parser regression, fixed in 1.0.17.
* Various performance improvements to the HTML5 parser. (#43, #44)
* Fix `Element#isHTML` for non-HTML elements. (#41)

# domino 1.0.15 (21 Jan 2014)
* Implement `Element#matches()`.
* Fix CSS `[lang]`, `[dir]`, etc selectors.
* Update `mocha` dependency to 1.17.x.

# domino 1.0.14 (21 Dec 2013)
* `Element#classList.length` should be 0 if there's no `class`
  attribute.
* Add `height`/`width` attributes to `HTMLImageElement`.
* Fix node 0.11 incompatibility in the w3c test harness.
* Update `mocha` dependency to 1.16.x; update `should` dependency to 2.1.x.

# domino 1.0.13 (8 Oct 2013)
* Include `<th>` elements in `HTMLTableRowElement#cells`. (#38, #39)
* Fix old call to `toLowerCase()` function. (#37)
* Update `mocha` and `should` dependencies.

# domino 1.0.12 (9 Jul 2013)
* Fix bug in formatting element adoption agency algorithm. (#36)
* Coerce `document.createTextNode` argument to a string. (#34, #35)
* Work around performance regression in node <= 0.6.

# domino 1.0.11 (1 May 2013)
* Fix rooted element traversal (`Element#nextElement`,
  `Element#getElementsByTagName`).  (#31, #32)
* Update zest to fix bugs in `+` and `>` combinators.
* Don't overflow the stack if attribute values are very large (>64k).

# domino 1.0.10 (12 Apr 2013)
* Document issues with `Element#attributes`. (#27)
* Fix `Document#title` to match DOM spec. (#29)
* Add missing `require('utils')` for `handleErrors`. (#28)
* Implement `DocumentFragment#querySelector` and
  `DocumentFragment#querySelectorAll`. (#20, #26)
* Fix `querySelectorAll` on unparented `Element`s. (#23)
* Move `outerHTML`/`innerHTML` properties from `HTMLElement` to
  `Element` to match dom parsing spec. (#21)
* Update zest selector library to 0.0.4. (#25)
* Fix regression in node 0.10. (#22, #24)
* Update `mocha` and `should` dependencies.

# domino 1.0.9 (11 Mar 2013)
* Support jQuery 1.9.x by allowing `Element#attributes[qname]`.
* Implement `HTMLElement#outerHTML`. (#18)
* Only add newlines after `<pre>`/`<textarea>`/`<listing>` if
  necessary, to match HTML5 serialization spec. (#16, #17)
* Mirror node type properties (`ELEMENT_NODE`, etc) into
  `Node.prototype`. (#14, #15)

# domino 1.0.8

**DO NOT USE:** was inadvertently published identical to domino 1.0.7.

# domino 1.0.7 (16 Jan 2013)
* Throw `SyntaxError` upon invocation rather than build-time. (#10)
* Return nodes in document order. (#11)
* Added a TreeWalker implementation.
