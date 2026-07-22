// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * A curated list of short, common, easy-to-type English words for diceware-style
 * passphrase generation. All lowercase, no duplicates, no ambiguous look-alikes.
 * Entropy per word = log2(WORD_LIST.length); see passphrase.ts.
 */
export const WORD_LIST: readonly string[] = [
  'able', 'acid', 'acre', 'aloe', 'amber', 'anchor', 'angle', 'ankle', 'apple', 'april',
  'arc', 'arch', 'arena', 'armor', 'arrow', 'aspen', 'atlas', 'autumn', 'axis', 'badge',
  'bagel', 'baker', 'balsa', 'bamboo', 'banjo', 'barge', 'basil', 'basin', 'beach', 'beacon',
  'beam', 'bean', 'bear', 'beaver', 'bench', 'berry', 'birch', 'bison', 'blaze', 'bloom',
  'blue', 'board', 'boat', 'bolt', 'bonus', 'boost', 'booth', 'brave', 'bread', 'brick',
  'bridge', 'brisk', 'broom', 'brook', 'brush', 'bubble', 'bucket', 'buffalo', 'bugle', 'bunny',
  'burst', 'cabin', 'cable', 'cactus', 'camel', 'candle', 'canoe', 'canvas', 'canyon', 'carbon',
  'cargo', 'carol', 'carry', 'castle', 'cedar', 'cello', 'chalk', 'charm', 'cheese', 'cherry',
  'chess', 'chime', 'cider', 'cinema', 'circle', 'citrus', 'clay', 'clever', 'cliff', 'cloud',
  'clover', 'cobra', 'cocoa', 'comet', 'compass', 'copper', 'coral', 'cosmos', 'cotton', 'cougar',
  'crane', 'crate', 'cream', 'crisp', 'crow', 'crystal', 'cube', 'cumin', 'curve', 'cymbal',
  'daisy', 'dance', 'dawn', 'deer', 'delta', 'denim', 'desert', 'diamond', 'diary', 'dolphin',
  'domino', 'donut', 'dove', 'draft', 'dragon', 'dream', 'drift', 'drum', 'dune', 'eagle',
  'early', 'earth', 'easel', 'east', 'echo', 'edge', 'elbow', 'elder', 'ember', 'emerald',
  'engine', 'evening', 'fable', 'falcon', 'fancy', 'fawn', 'feather', 'fennel', 'fern', 'festival',
  'ferry', 'fiber', 'fiddle', 'field', 'finch', 'flame', 'flint', 'float', 'flora', 'flute',
  'foam', 'forest', 'fox', 'frost', 'galaxy', 'garden', 'garlic', 'gauge', 'gecko', 'ginger',
  'glacier', 'glade', 'glass', 'glide', 'globe', 'glow', 'gold', 'grain', 'granite', 'grape',
  'grass', 'gravel', 'green', 'grove', 'guava', 'gulf', 'hammer', 'harbor', 'harvest', 'hazel',
  'heron', 'hickory', 'honey', 'hood', 'horizon', 'ice', 'iris', 'island', 'ivory', 'jade',
  'jasmine', 'jelly', 'jewel', 'juniper', 'kayak', 'kelp', 'kettle', 'kite', 'koala', 'lagoon',
  'lake', 'lamp', 'lantern', 'lark', 'laurel', 'lava', 'leaf', 'ledger', 'lemon', 'lentil',
  'lily', 'lime', 'linen', 'lion', 'lobby', 'locket', 'lotus', 'lunar', 'lynx', 'mango',
  'maple', 'marble', 'marsh', 'meadow', 'melon', 'meteor', 'mint', 'mirror', 'misty', 'mocha',
  'moss', 'motor', 'mountain', 'mural', 'nectar', 'needle', 'nest', 'noble', 'north', 'nova',
  'oak', 'oasis', 'ocean', 'olive', 'onion', 'opal', 'orange', 'orbit', 'orchid', 'otter',
  'oyster', 'paddle', 'palm', 'panda', 'pansy', 'paper', 'parka', 'parsley', 'peach', 'pearl',
  'pebble', 'pecan', 'pepper', 'petal', 'pewter', 'pine', 'pixel', 'planet', 'plaza', 'plum',
  'pollen', 'pond', 'poppy', 'prairie', 'prism', 'pueblo', 'quartz', 'quail', 'quill', 'quince',
  'radish', 'rapid', 'raven', 'reed', 'reef', 'ribbon', 'ridge', 'river', 'robin', 'rocket',
  'rose', 'rowan', 'ruby', 'rudder', 'saffron', 'sage', 'sail', 'salmon', 'sand', 'sapphire',
  'satin', 'savanna', 'scarf', 'sequoia', 'shadow', 'shell', 'shore', 'silk', 'silver', 'sleet',
  'slate', 'sleigh', 'sloth', 'snow', 'solar', 'sonnet', 'sorrel', 'spark', 'sparrow', 'spice',
  'spruce', 'squid', 'stable', 'stag', 'starling', 'steam', 'stem', 'stone', 'stork', 'storm',
  'stream', 'sugar', 'summit', 'sunset', 'swan', 'swift', 'sycamore', 'table', 'talon', 'tangerine',
  'teal', 'temple', 'thicket', 'thistle', 'thunder', 'tiger', 'timber', 'topaz', 'torch', 'totem',
  'tulip', 'tundra', 'turtle', 'twig', 'umber', 'unity', 'valley', 'vapor', 'velvet', 'vine',
  'violet', 'vista', 'vortex', 'walnut', 'walrus', 'wattle', 'wave', 'whale', 'wheat', 'willow',
  'window', 'winter', 'wolf', 'woven', 'yarn', 'yeast', 'zebra', 'zenith', 'zephyr', 'zinnia',
];
