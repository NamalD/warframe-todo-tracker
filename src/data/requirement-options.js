/**
 * Predefined upgrade options for loadout equipment slots, organized by slot_type.
 * Each option has a name and wiki_url (Warframe Fandom).
 */

const REQUIREMENT_OPTIONS = {
  warframe: [
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
    { name: 'Exilus Warframe Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Warframe_Adapter' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Aura Forma', wiki_url: 'https://warframe.fandom.com/wiki/Aura_Forma' },
    { name: 'Umbra Forma', wiki_url: 'https://warframe.fandom.com/wiki/Umbra_Forma' },
  ],
  primary: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Exilus Weapon Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Weapon_Adapter' },
    { name: 'Primary Arcane Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Primary_Arcane_Adapter' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
  ],
  secondary: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Exilus Weapon Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Weapon_Adapter' },
    { name: 'Secondary Arcane Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Secondary_Arcane_Adapter' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
  ],
  melee: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Exilus Weapon Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Weapon_Adapter' },
    { name: 'Melee Arcane Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Melee_Arcane_Adapter' },
    { name: 'Stance Forma', wiki_url: 'https://warframe.fandom.com/wiki/Stance_Forma' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Umbra Forma', wiki_url: 'https://warframe.fandom.com/wiki/Umbra_Forma' },
  ],
  companion: [
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
  ],
  archwing: [
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
  ],
  other: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Gravimag', wiki_url: 'https://warframe.fandom.com/wiki/Gravimag' },
    { name: 'Archgun Arcane Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Archgun_Arcane_Adapter' },
  ],
};

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
  return opts.slice();
}

/**
 * Get all available slot types that have predefined options.
 * @returns {string[]}
 */
export function getAllSlotTypes() {
  return Object.keys(REQUIREMENT_OPTIONS);
}

export default REQUIREMENT_OPTIONS;
