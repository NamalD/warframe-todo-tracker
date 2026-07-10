/**
 * Type declaration for 'server-only' package.
 *
 * server-only is a build-time guard that throws at runtime if
 * imported from client components. It has no public API — it's
 * a side-effect-only import that Next.js enforces at build time.
 */
declare module 'server-only';
