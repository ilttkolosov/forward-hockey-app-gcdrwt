import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { trackScreenView } from '../services/analyticsService';

interface ScreenRoute {
  pattern: RegExp;
  screen: string;
}

const SCREEN_ROUTES: readonly ScreenRoute[] = [
  { pattern: /^\/$/, screen: 'home' },
  { pattern: /^\/players$/, screen: 'players' },
  { pattern: /^\/player\/[^/]+$/, screen: 'player_detail' },
  { pattern: /^\/trainings$/, screen: 'schedule' },
  { pattern: /^\/upcoming$/, screen: 'upcoming_games' },
  { pattern: /^\/game\/[^/]+$/, screen: 'game_detail' },
  { pattern: /^\/season$/, screen: 'season_list' },
  { pattern: /^\/season\/[^/]+$/, screen: 'season_detail' },
  { pattern: /^\/tournaments$/, screen: 'tournament_list' },
  { pattern: /^\/tournaments\/[^/]+$/, screen: 'tournament_detail' },
  { pattern: /^\/command\/[^/]+$/, screen: 'team_detail' },
  { pattern: /^\/settings$/, screen: 'settings' },
  { pattern: /^\/about$/, screen: 'about' },
  { pattern: /^\/mobilegames$/, screen: 'mobile_games' },
  {
    pattern: /^\/mobilegames\/ice-resurfacing$/,
    screen: 'mobile_game_ice_resurfacing',
  },
  {
    pattern: /^\/mobilegames\/five-in-row$/,
    screen: 'mobile_game_five_in_row',
  },
  { pattern: /^\/mobilegames\/hockey$/, screen: 'mobile_game_hockey' },
  { pattern: /^\/mobilegames\/[^/]+$/, screen: 'mobile_game_memory' },
  { pattern: /^\/messenger$/, screen: 'messenger_entry' },
  { pattern: /^\/messenger\/register$/, screen: 'messenger_auth' },
  {
    pattern: /^\/messenger\/change-password$/,
    screen: 'messenger_change_password',
  },
  { pattern: /^\/messenger\/rooms$/, screen: 'messenger_rooms' },
  { pattern: /^\/messenger\/room\/[^/]+$/, screen: 'messenger_room' },
  { pattern: /^\/messenger\/contacts$/, screen: 'messenger_contacts' },
  {
    pattern: /^\/messenger\/contact\/[^/]+$/,
    screen: 'messenger_contact',
  },
  {
    pattern: /^\/messenger\/group\/create$/,
    screen: 'messenger_group_create',
  },
  { pattern: /^\/messenger\/group\/[^/]+$/, screen: 'messenger_group' },
  { pattern: /^\/messenger\/profile$/, screen: 'messenger_profile' },
  { pattern: /^\/messenger\/search$/, screen: 'messenger_search' },
  { pattern: /^\/messenger\/share$/, screen: 'messenger_share' },
];

function screenNameForPath(pathname: string): string {
  return SCREEN_ROUTES.find(({ pattern }) => pattern.test(pathname))?.screen ||
    'unknown';
}

/** Central screen tracking avoids duplicate hooks and never sends route IDs. */
export default function AnalyticsRouteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackScreenView(screenNameForPath(pathname));
  }, [pathname]);

  return null;
}
