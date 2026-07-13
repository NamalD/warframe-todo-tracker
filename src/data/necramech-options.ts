import type { SlotType } from '../../types/data';

/**
 * Necramech, Archgun, and Necramech-melee reference data.
 *
 * These items are not modeled in @wfcd/items in a form the prebuild
 * pipeline can cleanly consume (necramechs are filed under the generic
 * "Warframes" category, and necramech-exclusive melees aren't attached to
 * any weapon category at all), so they're hand-transcribed here rather
 * than sourced from public/data/wfcd-cache.json — same approach as
 * INCARNON_GENESIS_INSTALL_COSTS in scripts/prebuild.mjs.
 */

export const NECRAMECHS: string[] = ['Bonewidow', 'Voidrig'];

export const ARCHGUNS: string[] = [
  'Arbucep', 'Cortege', 'Corvas', 'Corvas Prime', 'Cyngas', 'Dual Decurion',
  'Fluctus', 'Grattler', 'Imperator', 'Imperator Vandal', 'Kuva Ayanga',
  'Kuva Grattler', 'Larkspur', 'Larkspur Prime', 'Mandonel', 'Mausolon',
  'Morgha', 'Phaedra', 'Prisma Dual Decurions', 'Velocitus',
];

/** Each necramech has exactly one exclusive melee weapon. */
const NECRAMECH_MELEE_BY_MECH: Record<string, string> = {
  Bonewidow: 'Ironbridge',
  Voidrig: 'Cocytus',
};

export const NECRAMECH_MELEES: string[] = Object.values(NECRAMECH_MELEE_BY_MECH);

/**
 * Get the necramech-exclusive melee weapon(s) for a given necramech name.
 * Falls back to the full list when the mech is unknown/unset so the melee
 * slot is never blocked on the necramech slot being filled first.
 */
export function getNecramechMeleesFor(necramechName: string | null | undefined): string[] {
  if (necramechName && NECRAMECH_MELEE_BY_MECH[necramechName]) {
    return [NECRAMECH_MELEE_BY_MECH[necramechName]];
  }
  return NECRAMECH_MELEES;
}

const SLOT_TYPE_LABELS: Partial<Record<SlotType, string>> = {
  necramech_melee: 'necramech melee',
};

/**
 * Display label for a slot_type — most are already human-readable;
 * a few (e.g. 'necramech_melee') need a space in place of the underscore.
 */
export function formatSlotType(slotType: SlotType): string {
  return SLOT_TYPE_LABELS[slotType] || slotType;
}
