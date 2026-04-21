/**
 * Local type stub for `expo-apple-authentication`.
 *
 * Why: the sandbox used for Day-4 code generation cannot write to node_modules, so
 * `npx expo install expo-apple-authentication` has to run Windows-side. Once the real
 * package is installed, its bundled `.d.ts` takes precedence over this stub (ambient
 * module declarations are only consulted when no real resolution exists).
 *
 * The surface here covers only the APIs we call from `src/services/authService.ts`:
 *   - isAvailableAsync()
 *   - signInAsync({ requestedScopes })
 *   - AppleAuthenticationScope enum
 *
 * Remove this file once the dependency is confirmed present in node_modules.
 */
declare module 'expo-apple-authentication' {
  export enum AppleAuthenticationScope {
    FULL_NAME = 0,
    EMAIL = 1,
  }

  export interface AppleAuthenticationCredential {
    user: string;
    email: string | null;
    fullName: {
      givenName: string | null;
      familyName: string | null;
    } | null;
    identityToken: string | null;
    authorizationCode: string | null;
    realUserStatus: number;
    state: string | null;
  }

  export interface AppleAuthenticationSignInOptions {
    requestedScopes?: AppleAuthenticationScope[];
    state?: string;
    nonce?: string;
  }

  export function isAvailableAsync(): Promise<boolean>;
  export function signInAsync(
    options?: AppleAuthenticationSignInOptions,
  ): Promise<AppleAuthenticationCredential>;
}
