/**
 * Local type stub for `expo-clipboard`.
 *
 * Why: the sandbox used for Day-3 code generation cannot write to node_modules, so
 * `npx expo install expo-clipboard` has to run Windows-side. Once the real package
 * is installed, its bundled `.d.ts` takes precedence over this stub (ambient module
 * declarations are only consulted when no real resolution exists).
 *
 * Remove this file on Day 4+ once the dependency is confirmed present in node_modules.
 */
declare module 'expo-clipboard' {
  export function setStringAsync(text: string): Promise<boolean>;
  export function getStringAsync(): Promise<string>;
  export function hasStringAsync(): Promise<boolean>;
}
