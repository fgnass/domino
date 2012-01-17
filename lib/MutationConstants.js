// The value of a Text, Comment or PI node changed
const MUTATE_VALUE = 1;

// A new attribute was added or an attribute value and/or prefix changed
const MUTATE_ATTR = 2;

// An attribute was removed
const MUTATE_REMOVE_ATTR = 3;

// A node was removed
const MUTATE_REMOVE = 4;

// A node was moved
const MUTATE_MOVE = 5;

// A node (or a subtree of nodes) was inserted
const MUTATE_INSERT = 6;