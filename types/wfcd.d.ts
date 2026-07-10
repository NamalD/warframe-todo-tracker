/**
 * Ambient type declarations for the @wfcd/items npm package.
 *
 * @wfcd/items doesn't ship its own TypeScript declarations,
 * so we provide minimal types for the APIs we actually use.
 * If the package adds official types in a future version,
 * remove this file and use the built-in declarations instead.
 */

declare module '@wfcd/items' {
  /**
   * The Items class parses Warframe game data from the
   * official Warframe Community Developers dataset.
   *
   * We only declare the constructor and methods actually
   * used by scripts/prebuild.mjs.
   */
  class Items {
    /**
     * @param options  Configuration object.
     * @param options.category  Array of category strings to load (e.g. ['Warframes', 'Primary', 'Melee']).
     */
    constructor(options: { category: string[] });

    /**
     * Returns an array of raw item objects from @wfcd/items.
     * Each item has a `name`, `uniqueName`, `category`, `type`,
     * `drops`, `components`, `tradable`, `masteryReq`, `productCategory`,
     * and other Warframe-data fields.
     *
     * Shape is intentionally loose (Record<string, unknown>)
     * because @wfcd/items adds/removes fields across versions.
     * Our prebuild script is responsible for normalizing this
     * into the app's typed Item structure.
     */
    getItems(): Record<string, unknown>[];
  }

  export default Items;
}
