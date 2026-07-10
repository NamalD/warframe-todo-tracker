// @ts-nocheck
export const seedItems = [
  {
    id: 'item-1',
    name: 'Excalibur',
    item_type: 'warframe',
    mastery_rank_required: 0,
    is_user_tracked: true,
    blueprint_source: 'quest',
    wiki_url: 'https://wiki.warframe.com/w/Excalibur',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-2',
    name: 'Mesa',
    item_type: 'warframe',
    mastery_rank_required: 4,
    is_user_tracked: false,
    blueprint_source: 'research',
    wiki_url: 'https://wiki.warframe.com/w/Mesa',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-3',
    name: 'Kronen Prime',
    item_type: 'melee',
    mastery_rank_required: 14,
    is_user_tracked: false,
    blueprint_source: 'drop',
    wiki_url: 'https://wiki.warframe.com/w/Kronen_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-4',
    name: 'Rubico Prime',
    item_type: 'primary',
    mastery_rank_required: 12,
    is_user_tracked: true,
    blueprint_source: 'drop',
    wiki_url: 'https://wiki.warframe.com/w/Rubico_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-5',
    name: 'Akks Prime',
    item_type: 'companion',
    mastery_rank_required: 6,
    is_user_tracked: false,
    blueprint_source: 'clan',
    wiki_url: 'https://wiki.warframe.com/w/Akks_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-6',
    name: 'Amesha Prime',
    item_type: 'archwing',
    mastery_rank_required: 10,
    is_user_tracked: true,
    blueprint_source: 'clan',
    wiki_url: 'https://wiki.warframe.com/w/Amesha_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-7',
    name: 'Mara Detron',
    item_type: 'secondary',
    mastery_rank_required: 7,
    is_user_tracked: false,
    blueprint_source: 'quest',
    wiki_url: 'https://wiki.warframe.com/w/Mara_Detron',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-8',
    name: 'Lanka',
    item_type: 'primary',
    mastery_rank_required: 7,
    is_user_tracked: false,
    blueprint_source: 'market',
    wiki_url: 'https://wiki.warframe.com/w/Lanka',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-9',
    name: 'Dakra Prime',
    item_type: 'melee',
    mastery_rank_required: 7,
    is_user_tracked: true,
    blueprint_source: 'drop',
    wiki_url: 'https://wiki.warframe.com/w/Dakra_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-10',
    name: 'Odonata Prime',
    item_type: 'archwing',
    mastery_rank_required: 4,
    is_user_tracked: false,
    blueprint_source: 'research',
    wiki_url: 'https://wiki.warframe.com/w/Odonata_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  // Component items for tree relationships
  {
    id: 'item-111',
    name: 'Excalibur Prime Chassis',
    item_type: 'other',
    mastery_rank_required: 3,
    is_user_tracked: false,
    blueprint_source: 'drop',
    wiki_url: 'https://wiki.warframe.com/w/Excalibur_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-112',
    name: 'Mesa Prime Neuroptics',
    item_type: 'other',
    mastery_rank_required: 4,
    is_user_tracked: false,
    blueprint_source: 'research',
    wiki_url: 'https://wiki.warframe.com/w/Mesa_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'item-113',
    name: 'Kronen Prime Handle',
    item_type: 'other',
    mastery_rank_required: 14,
    is_user_tracked: false,
    blueprint_source: 'drop',
    wiki_url: 'https://wiki.warframe.com/w/Kronen_Prime',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  }
];

export const seedMaterials = [
  { id: 'mat-1', craftable_item_id: 'item-1', material_name: 'Alloy Plate', quantity_required: 500, wiki_url: 'https://wiki.warframe.com/w/Alloy_Plate', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-2', craftable_item_id: 'item-1', material_name: 'Polymer Bundle', quantity_required: 600, wiki_url: 'https://wiki.warframe.com/w/Polymer_Bundle', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-3', craftable_item_id: 'item-1', material_name: 'Ferrite', quantity_required: 150, wiki_url: 'https://wiki.warframe.com/w/Ferrite', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-4', craftable_item_id: 'item-1', material_name: 'Argon Crystal', quantity_required: 1, wiki_url: 'https://wiki.warframe.com/w/Argon_Crystal', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-5', craftable_item_id: 'item-2', material_name: 'Morphics', quantity_required: 3, wiki_url: 'https://wiki.warframe.com/w/Morphics', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-6', craftable_item_id: 'item-2', material_name: 'Ferrite', quantity_required: 500, wiki_url: 'https://wiki.warframe.com/w/Ferrite', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-7', craftable_item_id: 'item-2', material_name: 'Rubedo', quantity_required: 100, wiki_url: 'https://wiki.warframe.com/w/Rubedo', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-8', craftable_item_id: 'item-3', material_name: 'Argon Crystal', quantity_required: 2, wiki_url: 'https://wiki.warframe.com/w/Argon_Crystal', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-9', craftable_item_id: 'item-3', material_name: 'Orokin Cell', quantity_required: 6, wiki_url: 'https://wiki.warframe.com/w/Orokin_Cell', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-10', craftable_item_id: 'item-4', material_name: 'Argon Crystal', quantity_required: 2, wiki_url: 'https://wiki.warframe.com/w/Argon_Crystal', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-11', craftable_item_id: 'item-4', material_name: 'Polymer Bundle', quantity_required: 500, wiki_url: 'https://wiki.warframe.com/w/Polymer_Bundle', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-12', craftable_item_id: 'item-4', material_name: 'Alloy Plate', quantity_required: 800, wiki_url: 'https://wiki.warframe.com/w/Alloy_Plate', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-13', craftable_item_id: 'item-5', material_name: 'Ferrite', quantity_required: 600, wiki_url: 'https://wiki.warframe.com/w/Ferrite', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-14', craftable_item_id: 'item-5', material_name: 'Polymer Bundle', quantity_required: 400, wiki_url: 'https://wiki.warframe.com/w/Polymer_Bundle', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-15', craftable_item_id: 'item-5', material_name: 'Circuits', quantity_required: 800, wiki_url: 'https://wiki.warframe.com/w/Circuits', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-16', craftable_item_id: 'item-6', material_name: 'Polymer Bundle', quantity_required: 500, wiki_url: 'https://wiki.warframe.com/w/Polymer_Bundle', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-17', craftable_item_id: 'item-6', material_name: 'Nano Spores', quantity_required: 5, wiki_url: 'https://wiki.warframe.com/w/Nano_Spores', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-18', craftable_item_id: 'item-6', material_name: 'Alloy Plate', quantity_required: 600, wiki_url: 'https://wiki.warframe.com/w/Alloy_Plate', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-19', craftable_item_id: 'item-7', material_name: 'Alloy Plate', quantity_required: 400, wiki_url: 'https://wiki.warframe.com/w/Alloy_Plate', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-20', craftable_item_id: 'item-7', material_name: 'Ferrite', quantity_required: 600, wiki_url: 'https://wiki.warframe.com/w/Ferrite', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-21', craftable_item_id: 'item-7', material_name: 'Argon Crystal', quantity_required: 2, wiki_url: 'https://wiki.warframe.com/w/Argon_Crystal', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-22', craftable_item_id: 'item-8', material_name: 'Ferrite', quantity_required: 800, wiki_url: 'https://wiki.warframe.com/w/Ferrite', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-23', craftable_item_id: 'item-8', material_name: 'Polymer Bundle', quantity_required: 300, wiki_url: 'https://wiki.warframe.com/w/Polymer_Bundle', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-24', craftable_item_id: 'item-8', material_name: 'Argon Crystal', quantity_required: 2, wiki_url: 'https://wiki.warframe.com/w/Argon_Crystal', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-25', craftable_item_id: 'item-8', material_name: 'Rubedo', quantity_required: 200, wiki_url: 'https://wiki.warframe.com/w/Rubedo', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-26', craftable_item_id: 'item-9', material_name: 'Alloy Plate', quantity_required: 600, wiki_url: 'https://wiki.warframe.com/w/Alloy_Plate', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-27', craftable_item_id: 'item-9', material_name: 'Orokin Cell', quantity_required: 3, wiki_url: 'https://wiki.warframe.com/w/Orokin_Cell', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-28', craftable_item_id: 'item-10', material_name: 'Polymer Bundle', quantity_required: 400, wiki_url: 'https://wiki.warframe.com/w/Polymer_Bundle', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-29', craftable_item_id: 'item-10', material_name: 'Circuits', quantity_required: 600, wiki_url: 'https://wiki.warframe.com/w/Circuits', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-30', craftable_item_id: 'item-10', material_name: 'Ferrite', quantity_required: 800, wiki_url: 'https://wiki.warframe.com/w/Ferrite', created_at: '2026-07-06T00:00:00Z' },
  { id: 'mat-31', craftable_item_id: 'item-10', material_name: 'Salvage', quantity_required: 120, wiki_url: 'https://wiki.warframe.com/w/Salvage', created_at: '2026-07-06T00:00:00Z' }
];

export const seedSources = [
  { id: 'src-1', material_name: 'Alloy Plate', source_name: 'Ocean', source_type: 'planet', location_details: 'Earth (Survival)', drop_chance_pct: 35.2, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-2', material_name: 'Alloy Plate', source_name: 'Vesper', source_type: 'mission', location_details: 'Venus (Capture)', drop_chance_pct: 12.5, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-3', material_name: 'Polymer Bundle', source_name: 'Hepit', source_type: 'mission', location_details: 'Void (Capture) rotation C', drop_chance_pct: 12.5, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-4', material_name: 'Polymer Bundle', source_name: 'Ukko', source_type: 'mission', location_details: 'Void (Capture) rotation C', drop_chance_pct: 11.8, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-5', material_name: 'Polymer Bundle', source_name: 'Isola', source_type: 'mission', location_details: 'Venus (Capture) rotation B', drop_chance_pct: 10.4, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-6', material_name: 'Ferrite', source_name: 'Everest', source_type: 'planet', location_details: 'Earth (Exterminate)', drop_chance_pct: 33.0, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-7', material_name: 'Ferrite', source_name: 'Montalvu', source_type: 'mission', location_details: 'Ceres (Survival)', drop_chance_pct: 14.7, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-8', material_name: 'Ferrite', source_name: 'Laridae', source_type: 'mission', location_details: 'Lua (Exterminate)', drop_chance_pct: 9.3, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-9', material_name: 'Argon Crystal', source_name: 'Orokin Void', source_type: 'planet', location_details: 'Any Void fissure — time-limited pickup', drop_chance_pct: 7.3, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-10', material_name: 'Argon Crystal', source_name: 'Alerts', source_type: 'drop', location_details: 'Hard-Alert rotation reward', drop_chance_pct: 5.6, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-11', material_name: 'Morphics', source_name: 'Cyath', source_type: 'planet', location_details: 'Eris (Exterminate/Hive)', drop_chance_pct: 20.1, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-12', material_name: 'Morphics', source_name: 'Orokin Vault', source_type: 'relay', location_details: 'Orokin Moon (Vault runs)', drop_chance_pct: 8.4, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-13', material_name: 'Rubedo', source_name: 'Hepit', source_type: 'mission', location_details: 'Void (Capture) rotation C', drop_chance_pct: 12.5, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-14', material_name: 'Rubedo', source_name: 'Pythandros', source_type: 'mission', location_details: 'Jupiter (Survival)', drop_chance_pct: 15.8, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-15', material_name: 'Circuits', source_name: 'Mithra', source_type: 'mission', location_details: 'Void (Interception)', drop_chance_pct: 11.2, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-16', material_name: 'Circuits', source_name: 'Rook', source_type: 'planet', location_details: 'Mercury (Capture)', drop_chance_pct: 24.5, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-17', material_name: 'Nano Spores', source_name: 'The Index', source_type: 'mission', location_details: 'Neptune (Quick/Medium Index)', drop_chance_pct: 18.3, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-18', material_name: 'Nano Spores', source_name: 'The Pit', source_type: 'planet', location_details: 'Ceres (Infested Salvage)', drop_chance_pct: 27.7, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-19', material_name: 'Salvage', source_name: 'Brigade', source_type: 'planet', location_details: 'Antimatter (Exterminate)', drop_chance_pct: 40.0, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-20', material_name: 'Salvage', source_name: 'Tycho', source_type: 'mission', location_details: 'Mars (Spy)', drop_chance_pct: 22.1, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-21', material_name: 'Orokin Cell', source_name: 'Gabba', source_type: 'planet', location_details: 'Eris (Survival)', drop_chance_pct: 15.2, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  { id: 'src-22', material_name: 'Orokin Cell', source_name: 'Ropey Hard', source_type: 'mission', location_details: 'Eris (Disruption)', drop_chance_pct: 9.8, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' }
];

export const seedTreeRelationships = [
  { id: 'tree-1', parent_item_id: 'item-1', child_item_id: 'item-111', quantity_required: 1, created_at: '2026-07-06T00:00:00Z' },
  { id: 'tree-2', parent_item_id: 'item-2', child_item_id: 'item-112', quantity_required: 1, created_at: '2026-07-06T00:00:00Z' },
  { id: 'tree-3', parent_item_id: 'item-3', child_item_id: 'item-113', quantity_required: 1, created_at: '2026-07-06T00:00:00Z' }
];

export const seedTodos = [
  {
    id: 'todo-1',
    craftable_item_id: 'item-1',
    linked_material_name: null,
    user_notes: 'Craft Excalibur before the week-end farming sprint',
    status: 'in_progress',
    priority: 'high',
    due_at: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'todo-2',
    craftable_item_id: 'item-4',
    linked_material_name: 'Argon Crystal',
    user_notes: 'Argon decays — farm in Void first',
    status: 'pending',
    priority: 'medium',
    due_at: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  }
];
