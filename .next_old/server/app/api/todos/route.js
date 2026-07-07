"use strict";(()=>{var e={};e.id=603,e.ids=[603],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5943:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>m,patchFetch:()=>N,requestAsyncStorage:()=>u,routeModule:()=>l,serverHooks:()=>_,staticGenerationAsyncStorage:()=>p});var a={};r.r(a),r.d(a,{GET:()=>T,PUT:()=>E});var o=r(9303),n=r(8716),i=r(3131),s=r(8660);let d="todos";async function T(){try{let e=(0,s._)(d,[]);return Response.json(e)}catch(e){return console.error(`[api/todos GET] ${e.message}`),Response.json({error:"Failed to read todos"},{status:500})}}async function E(e){try{let t=await e.json();if(!Array.isArray(t))return Response.json({error:"Expected an array of todos"},{status:400});return(0,s.J)(d,t),Response.json({ok:!0})}catch(e){return console.error(`[api/todos PUT] ${e.message}`),Response.json({error:"Failed to write todos"},{status:500})}}let l=new o.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/todos/route",pathname:"/api/todos",filename:"route",bundlePath:"app/api/todos/route"},resolvedPagePath:"/home/namal/warframe-todo-tracker/app/api/todos/route.js",nextConfigOutput:"standalone",userland:a}),{requestAsyncStorage:u,staticGenerationAsyncStorage:p,serverHooks:_}=l,m="/api/todos/route";function N(){return(0,i.patchFetch)({serverHooks:_,staticGenerationAsyncStorage:p})}},9303:(e,t,r)=>{e.exports=r(517)},8660:(e,t,r)=>{r.d(t,{_:()=>m,J:()=>N});let a=require("better-sqlite3");var o=r.n(a);let n=require("node:path");var i=r.n(n);let s=require("node:fs");var d=r.n(s);let T=process.env.DATA_DIR||i().join(process.cwd(),"data"),E=i().join(T,"warframe.db"),l=[{version:1,description:"Initial SQLite schema — migrated from JSON files",sql:String.raw`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- LOADOUTS
-- Each loadout stores its full nested structure (slots,
-- requirements, materials) as a JSON blob in 'data'.
-- ============================================================
CREATE TABLE IF NOT EXISTS loadouts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL DEFAULT '{}',
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loadouts_updated_at ON loadouts(updated_at);

-- ============================================================
-- TODOS
-- Flat document, fully normalized columns.
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
    id                  TEXT PRIMARY KEY,
    craftable_item_id   TEXT,
    linked_material_name TEXT,
    user_notes          TEXT DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','completed','abandoned')),
    priority            TEXT DEFAULT 'medium'
                        CHECK(priority IN ('low','medium','high')),
    due_at              TEXT,
    version             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);

-- ============================================================
-- MATERIALS INVENTORY
-- Simple key-value: material_name → quantity_owned.
-- ============================================================
CREATE TABLE IF NOT EXISTS materials_inventory (
    material_name   TEXT PRIMARY KEY,
    quantity        INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    version         INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SYNC METADATA
-- Key-value store for sync-related bookkeeping.
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_meta (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

-- ============================================================
-- CONFLICT LOG
-- Records conflicts resolved via last-writer-wins.
-- ============================================================
CREATE TABLE IF NOT EXISTS conflict_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    client_version  INTEGER NOT NULL,
    server_version  INTEGER NOT NULL,
    device_id       TEXT NOT NULL,
    resolved_at     TEXT NOT NULL DEFAULT (datetime('now')),
    details         TEXT
);

CREATE INDEX IF NOT EXISTS idx_conflict_log_resolved ON conflict_log(resolved_at);
`}],u=null;function p(){return u||(d().mkdirSync(T,{recursive:!0}),(u=new(o())(E)).pragma("journal_mode = WAL"),u.pragma("foreign_keys = ON"),function(e){e.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL
    );
  `);let t=e.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_version").get().version;for(let r of l)r.version>t&&(e.exec(r.sql),e.prepare("INSERT INTO schema_version (version, description) VALUES (?, ?)").run(r.version,r.description))}(u)),u}let _={loadouts:"loadouts",todos:"todos","materials-inventory":"materials_inventory"};function m(e,t=null){let r=_[e];if(!r)return t;try{let e;return"loadouts"===r?e=p().prepare("SELECT data FROM loadouts ORDER BY id").all().map(e=>JSON.parse(e.data)):"todos"===r?e=p().prepare(`
    SELECT id, craftable_item_id, linked_material_name, user_notes,
           status, priority, due_at
    FROM todos ORDER BY id
  `).all().map(e=>({id:e.id,craftable_item_id:e.craftable_item_id,linked_material_name:e.linked_material_name,user_notes:e.user_notes,status:e.status,priority:e.priority,due_at:e.due_at})):"materials_inventory"===r&&(e=function(){let e=p().prepare("SELECT material_name, quantity FROM materials_inventory").all(),t={};for(let r of e)t[r.material_name]=r.quantity;return t}()),e}catch(e){return console.error(`[server-store readStore] ${e.message}`),t}}function N(e,t){let r=_[e];if(!r)throw Error(`Unknown store key: ${e}`);"loadouts"===r?function(e){let t=p();t.transaction(()=>{if(t.prepare("DELETE FROM loadouts").run(),0===e.length)return;let r=t.prepare(`
      INSERT INTO loadouts (id, name, data, version, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);for(let t of e)r.run(t.id,t.name||"",JSON.stringify(t),t.created_at||new Date().toISOString(),t.updated_at||new Date().toISOString())})()}(t):"todos"===r?function(e){let t=p();t.transaction(()=>{if(t.prepare("DELETE FROM todos").run(),0===e.length)return;let r=t.prepare(`
      INSERT INTO todos
        (id, craftable_item_id, linked_material_name, user_notes,
         status, priority, due_at, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);for(let t of e)r.run(t.id,t.craftable_item_id||null,t.linked_material_name||null,t.user_notes||"",t.status||"pending",t.priority||"medium",t.due_at||null,t.created_at||new Date().toISOString(),t.updated_at||new Date().toISOString())})()}(t):"materials_inventory"===r&&function(e){let t=p();t.transaction(()=>{t.prepare("DELETE FROM materials_inventory").run();let r=Object.entries(e);if(0===r.length)return;let a=t.prepare(`
      INSERT INTO materials_inventory (material_name, quantity, version, updated_at)
      VALUES (?, ?, 1, ?)
    `);for(let[e,t]of r)a.run(e,t,new Date().toISOString())})()}(t)}}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),a=t.X(0,[948],()=>r(5943));module.exports=a})();