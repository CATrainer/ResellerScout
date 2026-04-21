/**
 * Local type stub for `expo-haptics`.
 *
 * Why: the sandbox used for Day-4 code generation cannot write to node_modules, so
 * `npx expo install expo-haptics` has to run Windows-side. Once the real package is
 * installed, its bundled `.d.ts` takes precedence over this stub (ambient module
 * declarations are only consulted when no real resolution exists).
 *
 * Remove this file once the dependency is confirmed present in node_modules.
 */
declare module 'expo-haptics' {
  export enum ImpactFeedbackStyle {
    Light = 'light',
    Medium = 'medium',
    Heavy = 'heavy',
    Soft = 'soft',
    Rigid = 'rigid',
  }
  export enum NotificationFeedbackType {
    Success = 'success',
    Warning = 'warning',
    Error = 'error',
  }
  export function impactAsync(style?: ImpactFeedbackStyle): Promise<void>;
  export function notificationAsync(type?: NotificationFeedbackType): Promise<void>;
  export function selectionAsync(): Promise<void>;
}
