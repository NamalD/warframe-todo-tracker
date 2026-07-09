/**
 * Predefined upgrade options for loadout equipment slots, organized by slot_type.
 * Wiki URLs are derived from names via constructWikiUrl-style transformation
 * in the component that renders them.
 */

const REQUIREMENT_OPTIONS = {
  warframe: [
    { name: 'Orokin Reactor' },
    { name: 'Exilus Warframe Adapter' },
    { name: 'Forma' },
    { name: 'Aura Forma' },
    { name: 'Umbra Forma' },
  ],
  primary: [
    { name: 'Orokin Catalyst' },
    { name: 'Exilus Weapon Adapter' },
    { name: 'Primary Arcane Adapter' },
    { name: 'Forma' },
  ],
  secondary: [
    { name: 'Orokin Catalyst' },
    { name: 'Exilus Weapon Adapter' },
    { name: 'Secondary Arcane Adapter' },
    { name: 'Forma' },
  ],
  melee: [
    { name: 'Orokin Catalyst' },
    { name: 'Exilus Weapon Adapter' },
    { name: 'Melee Arcane Adapter' },
    { name: 'Stance Forma' },
    { name: 'Forma' },
    { name: 'Umbra Forma' },
  ],
  companion: [
    { name: 'Orokin Reactor' },
  ],
  archwing: [
    { name: 'Orokin Reactor' },
    { name: 'Forma' },
  ],
  other: [
    { name: 'Orokin Catalyst' },
    { name: 'Orokin Reactor' },
    { name: 'Forma' },
    { name: 'Gravimag' },
    { name: 'Archgun Arcane Adapter' },
  ],
};

/**
 * Construct a wiki URL for a given item name.
 * @param {string} name
 * @returns {string}
 */
function constructWikiUrl(name) {
  return `https://wiki.warframe.com/w/${encodeURIComponent(name.replace(/ /g, '_'))}`;
}

/**
 * Get predefined requirement options for a given slot type.
 * @param {string} slotType - The slot_type string (e.g. 'warframe', 'primary')
 * @returns {Array<{name: string, wiki_url: string}>}
 */
export function getOptionsForSlot(slotType) {
  const opts = REQUIREMENT_OPTIONS[slotType];
  if (!opts) {
    return [];
  }
  return opts.map((o) => ({
    ...o,
    wiki_url: constructWikiUrl(o.name),
  }));
}

/**
 * Get all available slot types that have predefined options.
 * @returns {string[]}
 */
export function getAllSlotTypes() {
  return Object.keys(REQUIREMENT_OPTIONS);
}

export default REQUIREMENT_OPTIONS;
