import { Image } from 'react-native';
import { TEAM_LOGO_ASSETS } from '../assets/logo/generated';

const resolvedLogoUris = new Map<string, string>();

/** Статические require(), по которым Metro включает логотипы в IPA/APK. */
export const teamLogos = TEAM_LOGO_ASSETS;

export const hasBundledTeamLogo = (teamId: string): boolean => (
  TEAM_LOGO_ASSETS[String(teamId)] !== undefined
);

/**
 * Возвращает URI изображения внутри установленного приложения.
 * В production-сборке этот путь разрешается нативным asset registry и не
 * требует сети, AsyncStorage или копирования в documentDirectory.
 */
export const getBundledTeamLogoUri = (teamId: string): string | null => {
  const normalizedId = String(teamId);
  const cached = resolvedLogoUris.get(normalizedId);
  if (cached) return cached;

  const assetModule = TEAM_LOGO_ASSETS[normalizedId];
  if (assetModule === undefined) return null;
  const uri = Image.resolveAssetSource(assetModule)?.uri;
  if (!uri) return null;

  resolvedLogoUris.set(normalizedId, uri);
  return uri;
};
