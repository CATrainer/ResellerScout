/**
 * Local type stub for `@react-native-async-storage/async-storage`.
 *
 * Why: the sandbox used for Day-4 code generation cannot write to node_modules, so
 * `npx expo install @react-native-async-storage/async-storage` has to run Windows-side.
 * Once the real package is installed, its bundled `.d.ts` takes precedence over this
 * stub (ambient module declarations are only consulted when no real resolution exists).
 *
 * The surface here is just enough to satisfy the Supabase `storage` adapter option
 * in src/services/supabaseClient.ts.
 *
 * Remove this file once the dependency is confirmed present in node_modules.
 */
declare module '@react-native-async-storage/async-storage' {
  interface AsyncStorageStatic {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
    getAllKeys(): Promise<readonly string[]>;
    multiGet(keys: readonly string[]): Promise<ReadonlyArray<[string, string | null]>>;
    multiSet(entries: ReadonlyArray<[string, string]>): Promise<void>;
    multiRemove(keys: readonly string[]): Promise<void>;
  }
  const AsyncStorage: AsyncStorageStatic;
  export default AsyncStorage;
}
