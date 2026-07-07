/**
 * Predefined requirement options for loadout slots, organized by slot_type.
 * Each option has a name and optional wiki_url.
 */

const REQUIREMENT_OPTIONS = {
  warframe: [
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Exilus Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Adapter' },
    { name: 'Aura Forma', wiki_url: 'https://warframe.fandom.com/wiki/Aura_Forma' },
    { name: 'Stance Forma', wiki_url: 'https://warframe.fandom.com/wiki/Stance_Forma' },
    { name: 'Umbra Forma', wiki_url: 'https://warframe.fandom.com/wiki/Umbra_Forma' },
    { name: 'Lua Lens', wiki_url: 'https://warframe.fandom.com/wiki/Lua_Lens' },
    { name: 'Eidolon Lens', wiki_url: 'https://warframe.fandom.com/wiki/Eidolon_Lens' },
    { name: 'Greater Lens', wiki_url: 'https://warframe.fandom.com/wiki/Greater_Lens' },
    { name: 'Normal Lens', wiki_url: 'https://warframe.fandom.com/wiki/Lens' },
    { name: 'Arcane Energize', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Energize' },
    { name: 'Arcane Grace', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Grace' },
    { name: 'Arcane Guardian', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Guardian' },
    { name: 'Arcane Aegis', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Aegis' },
    { name: 'Arcane Avenger', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Avenger' },
    { name: 'Arcane Velocity', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Velocity' },
    { name: 'Arcane Barrier', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Barrier' },
    { name: 'Arcane Strike', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Strike' },
  ],
  primary: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Exilus Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Adapter' },
    { name: 'Arcane Primary', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Primary' },
    { name: 'Riven Mod', wiki_url: 'https://warframe.fandom.com/wiki/Riven_Mods' },
  ],
  secondary: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Exilus Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Adapter' },
    { name: 'Arcane Secondary', wiki_url: 'https://warframe.fandom.com/wiki/Arcane_Secondary' },
    { name: 'Riven Mod', wiki_url: 'https://warframe.fandom.com/wiki/Riven_Mods' },
  ],
  melee: [
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Exilus Adapter', wiki_url: 'https://warframe.fandom.com/wiki/Exilus_Adapter' },
    { name: 'Riven Mod', wiki_url: 'https://warframe.fandom.com/wiki/Riven_Mods' },
  ],
  companion: [
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
  ],
  archwing: [
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
  ],
  other: [
    { name: 'Forma', wiki_url: 'https://warframe.fandom.com/wiki/Forma' },
    { name: 'Orokin Catalyst', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Catalyst' },
    { name: 'Orokin Reactor', wiki_url: 'https://warframe.fandom.com/wiki/Orokin_Reactor' },
  ],
};

/**
 * Get predefined requirement options for a given slot type.
 * @param {string} slotType - The slot_type string (e.g. 'warframe', 'primary')
 * @returns {Array<{name: string, wiki_url?: string}>}
 */
export function getOptionsForSlot(slotType) {
  const opts = REQUIREMENT_OPTIONS[slotType] || REQUIREMENT_OPTIONS.other || [];
  return opts.slice();
}

/**
 * Get all requirement option names across all slot types
 * (useful for duplicate detection across all slots).
 * @returns {string[]}
 */
export function getAllOptionNames() {
  const names = new Set();
  for (const options of Object.values(REQUIREMENT_OPTIONS)) {
    for (const opt of options) {
      names.add(opt.name);
    }
  }
  return Array.from(names);
}

export default REQUIREMENT_OPTIONS;
