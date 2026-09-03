const identityByDisplayName = new Map<string, string | null>();

function normalizedDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

/**
 * Remembers every stable user ID together with the display forms seen for it.
 * A null value means the same display name belongs to more than one user and
 * therefore must not be used as an identity shortcut.
 */
export function registerMessengerAvatarIdentity(
  identityKey: string | null | undefined,
  ...displayNames: readonly (string | null | undefined)[]
): void {
  const stableIdentity = identityKey?.trim();
  if (!stableIdentity) return;

  for (const displayName of displayNames) {
    if (!displayName) continue;
    const normalized = normalizedDisplayName(displayName);
    if (!normalized) continue;
    if (!identityByDisplayName.has(normalized)) {
      identityByDisplayName.set(normalized, stableIdentity);
      continue;
    }
    const existing = identityByDisplayName.get(normalized);
    if (existing !== stableIdentity) identityByDisplayName.set(normalized, null);
  }
}

/**
 * User ID remains the primary avatar key. Some legacy UI surfaces only carry
 * display_name, so recover the ID learned while parsing the same API objects.
 * Falling back to the normalized display name preserves compatibility when a
 * truly identity-less object is rendered.
 */
export function resolveMessengerAvatarIdentity(
  identityKey: string | null | undefined,
  displayName: string,
): string {
  const stableIdentity = identityKey?.trim();
  if (stableIdentity) {
    registerMessengerAvatarIdentity(stableIdentity, displayName);
    return stableIdentity;
  }

  const normalized = normalizedDisplayName(displayName);
  const registered = identityByDisplayName.get(normalized);
  return registered || normalized || "forward";
}

export function clearMessengerAvatarIdentities(): void {
  identityByDisplayName.clear();
}
