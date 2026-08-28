import React, { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Href, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Icon from './Icon';
import { useMessengerAuth } from '../contexts/MessengerAuthContext';
import { useMessengerUnreadSnapshot } from '../services/messengerUnread';
import { messengerLog } from '../services/messengerLogger';
import { colors } from '../styles/commonStyles';

const NAVIGATION_RED = '#F2162D';
const NAVIGATION_HEIGHT = 70;
const NAVIGATION_CORNER_RADIUS = 27;
const HOME_ITEM_HEIGHT = 64;
const CENTER_BUTTON_SIZE = 65;
const CENTER_BUTTON_RADIUS = CENTER_BUTTON_SIZE / 2;
const CENTER_LOGO_SIZE = 58;
const NAVIGATION_CRADLE_GAP = 6;
const NAVIGATION_CRADLE_RADIUS = CENTER_BUTTON_RADIUS + NAVIGATION_CRADLE_GAP;
const NAVIGATION_CRADLE_FILLET_RADIUS = 21;
const NAVIGATION_CRADLE_DROP = 20;
const NAVIGATION_SHADOW_EXTENT = 18;

type NavigationSection =
  | 'trainings'
  | 'tournaments'
  | 'home'
  | 'messenger'
  | 'more';

interface NavigationItemProps {
  active: boolean;
  accessibilityLabel: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  badge?: number;
  onPress: () => void;
}

interface MoreMenuItem {
  href: Href;
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
}

interface NavigationSurfaceProps {
  safeAreaBottom: number;
  width: number;
}

const MORE_MENU_ITEMS: MoreMenuItem[] = [
  { href: '/mobilegames', icon: 'game-controller-outline', label: 'Игры' },
  { href: '/players', icon: 'people-outline', label: 'Игроки' },
  { href: '/settings', icon: 'settings-outline', label: 'Настройки' },
  { href: '/about', icon: 'information-circle-outline', label: 'О программе' },
];

const formatUnreadCount = (count: number) => (count > 99 ? '99+' : String(count));

const isNavigationHiddenRoute = (pathname: string) => (
  pathname.startsWith('/mobilegames/')
  || pathname.startsWith('/messenger/room/')
);

const activeSectionForPath = (pathname: string): NavigationSection | null => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/trainings')) return 'trainings';
  if (pathname.startsWith('/tournaments')) return 'tournaments';
  if (pathname.startsWith('/messenger')) return 'messenger';
  if (
    pathname.startsWith('/mobilegames')
    || pathname.startsWith('/players')
    || pathname.startsWith('/settings')
    || pathname.startsWith('/about')
  ) {
    return 'more';
  }
  return null;
};

function NavigationSurface({ safeAreaBottom, width }: NavigationSurfaceProps) {
  const centerX = width / 2;
  const totalHeight = NAVIGATION_HEIGHT + safeAreaBottom;
  const surfaceTop = NAVIGATION_SHADOW_EXTENT;
  const cradleRadius = NAVIGATION_CRADLE_RADIUS;
  const filletRadius = NAVIGATION_CRADLE_FILLET_RADIUS;
  const filletToCradleCenterY = filletRadius - NAVIGATION_CRADLE_DROP;
  const filletCenterOffset = Math.sqrt(
    ((cradleRadius + filletRadius) ** 2) - (filletToCradleCenterY ** 2),
  );
  const cradleTangentXOffset = (
    cradleRadius * filletCenterOffset / (cradleRadius + filletRadius)
  );
  const cradleTangentY = (
    NAVIGATION_CRADLE_DROP
    + (cradleRadius * filletToCradleCenterY / (cradleRadius + filletRadius))
  );
  const surfacePath = [
    `M 0 ${surfaceTop + NAVIGATION_CORNER_RADIUS}`,
    `Q 0 ${surfaceTop} ${NAVIGATION_CORNER_RADIUS} ${surfaceTop}`,
    `H ${centerX - filletCenterOffset}`,
    `A ${filletRadius} ${filletRadius} 0 0 1 ${centerX - cradleTangentXOffset} ${surfaceTop + cradleTangentY}`,
    `A ${cradleRadius} ${cradleRadius} 0 0 0 ${centerX + cradleTangentXOffset} ${surfaceTop + cradleTangentY}`,
    `A ${filletRadius} ${filletRadius} 0 0 1 ${centerX + filletCenterOffset} ${surfaceTop}`,
    `H ${width - NAVIGATION_CORNER_RADIUS}`,
    `Q ${width} ${surfaceTop} ${width} ${surfaceTop + NAVIGATION_CORNER_RADIUS}`,
    `V ${surfaceTop + totalHeight}`,
    'H 0',
    'Z',
  ].join(' ');

  return (
    <Svg
      height={totalHeight + NAVIGATION_SHADOW_EXTENT}
      pointerEvents="none"
      style={styles.navigationSurface}
      width={width}
    >
      <Path
        d={surfacePath}
        fill="#7C8490"
        fillOpacity={0.02}
        stroke="#7C8490"
        strokeOpacity={0.025}
        strokeWidth={27}
      />
      <Path
        d={surfacePath}
        fill="none"
        stroke="#7C8490"
        strokeOpacity={0.035}
        strokeWidth={16.5}
      />
      <Path
        d={surfacePath}
        fill="none"
        stroke="#7C8490"
        strokeOpacity={0.05}
        strokeWidth={7.5}
      />
      <Path
        d={surfacePath}
        fill="#FFFFFF"
        stroke="#DDE1E7"
        strokeLinejoin="round"
        strokeWidth={0.75}
      />
    </Svg>
  );
}

function UnreadBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  return (
    <View style={[styles.badge, compact && styles.compactBadge]}>
      <Text style={[styles.badgeText, compact && styles.compactBadgeText]}>
        {formatUnreadCount(count)}
      </Text>
    </View>
  );
}

function NavigationItem({
  active,
  accessibilityLabel,
  badge,
  icon,
  label,
  onPress,
}: NavigationItemProps) {
  const color = active ? NAVIGATION_RED : '#59616D';
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.72}
      onPress={onPress}
      style={styles.navigationItem}
    >
      <View style={styles.navigationIconWrap}>
        <Icon name={icon} size={25} color={color} />
        {badge !== undefined && badge > 0 && <UnreadBadge count={badge} compact />}
      </View>
      <Text numberOfLines={1} style={[styles.navigationLabel, active && styles.navigationLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function PersistentBottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const { isAuthenticated } = useMessengerAuth();
  const unread = useMessengerUnreadSnapshot();
  const [moreVisible, setMoreVisible] = useState(false);

  const messengerHref: Href = isAuthenticated
    ? '/messenger/rooms'
    : '/messenger/register';
  const activeSection = useMemo(() => activeSectionForPath(pathname), [pathname]);
  const unreadCount = isAuthenticated && unread.ready ? unread.count : 0;
  const navigationHidden = isNavigationHiddenRoute(pathname);
  const showUnreadBell = unreadCount > 0 && !pathname.startsWith('/messenger');

  useEffect(() => {
    if (!moreVisible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMoreVisible(false);
      return true;
    });
    return () => subscription.remove();
  }, [moreVisible]);

  useEffect(() => {
    if (navigationHidden) setMoreVisible(false);
  }, [navigationHidden]);

  useEffect(() => {
    messengerLog('info', 'navigation.visibility.changed', {
      pathname,
      hidden: navigationHidden,
    });
  }, [navigationHidden, pathname]);

  const pushRoute = (href: Href) => {
    setMoreVisible(false);
    if (typeof href === 'string' && pathname === href) return;
    router.push(href);
  };

  const openHome = () => {
    setMoreVisible(false);
    if (router.canDismiss()) {
      router.dismissAll();
      return;
    }
    if (pathname !== '/') router.replace('/');
  };

  if (navigationHidden) return null;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <>
          {showUnreadBell && (
            <TouchableOpacity
              accessibilityLabel={`Открыть общение, непрочитанных сообщений: ${unreadCount}`}
              accessibilityRole="button"
              activeOpacity={0.72}
              hitSlop={8}
              onPress={() => pushRoute(messengerHref)}
              style={[styles.unreadBell, { top: insets.top + 8 }]}
            >
              <Icon name="notifications-outline" size={25} color={colors.text} />
              <UnreadBadge count={unreadCount} compact />
            </TouchableOpacity>
          )}

          {moreVisible && (
            <View style={styles.moreOverlay}>
              <Pressable
                accessibilityLabel="Закрыть дополнительное меню"
                accessibilityRole="button"
                onPress={() => setMoreVisible(false)}
                style={styles.backdrop}
              />
              <View
                style={[
                  styles.moreSheet,
                  {
                    bottom: NAVIGATION_HEIGHT + Math.max(insets.bottom, 6),
                  },
                ]}
              >
                <View style={styles.sheetHandle} />
                {MORE_MENU_ITEMS.map((item, index) => (
                  <TouchableOpacity
                    accessibilityLabel={`Открыть раздел «${item.label}»`}
                    accessibilityRole="button"
                    activeOpacity={0.68}
                    key={item.label}
                    onPress={() => pushRoute(item.href)}
                    style={[
                      styles.moreMenuItem,
                      index < MORE_MENU_ITEMS.length - 1 && styles.moreMenuItemBorder,
                    ]}
                  >
                    <Icon name={item.icon} size={29} color={colors.text} />
                    <Text style={styles.moreMenuLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View
            style={[
              styles.navigationContainer,
              { paddingBottom: Math.max(insets.bottom, 6) },
            ]}
          >
            <NavigationSurface
              safeAreaBottom={Math.max(insets.bottom, 6)}
              width={viewportWidth}
            />
            <View style={styles.navigationItems}>
              <NavigationItem
                accessibilityLabel="Открыть тренировки"
                active={activeSection === 'trainings'}
                icon="barbell-outline"
                label="Тренировки"
                onPress={() => pushRoute('/trainings')}
              />
              <NavigationItem
                accessibilityLabel="Открыть турниры"
                active={activeSection === 'tournaments'}
                icon="trophy-outline"
                label="Турниры"
                onPress={() => pushRoute('/tournaments')}
              />

              <TouchableOpacity
                accessibilityLabel="Открыть главную страницу"
                accessibilityRole="button"
                accessibilityState={{ selected: activeSection === 'home' }}
                activeOpacity={0.78}
                hitSlop={{ top: 26, right: 5, bottom: 4, left: 5 }}
                onPress={openHome}
                style={styles.homeItem}
              >
                <View style={styles.homeButton}>
                  <Image
                    resizeMode="contain"
                    source={require('../assets/icons/myIcon.png')}
                    style={styles.homeLogo}
                  />
                </View>
              </TouchableOpacity>

              <NavigationItem
                accessibilityLabel="Открыть общение"
                active={activeSection === 'messenger'}
                badge={unreadCount}
                icon="chatbubble-ellipses-outline"
                label="Общение"
                onPress={() => pushRoute(messengerHref)}
              />
              <NavigationItem
                accessibilityLabel="Открыть дополнительное меню"
                active={activeSection === 'more' || moreVisible}
                icon="ellipsis-horizontal"
                label="Ещё"
                onPress={() => setMoreVisible(true)}
              />
            </View>
          </View>
      </>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  navigationContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    overflow: 'visible',
  },
  navigationSurface: {
    position: 'absolute',
    left: 0,
    top: -NAVIGATION_SHADOW_EXTENT,
  },
  navigationItems: {
    height: NAVIGATION_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 7,
    paddingHorizontal: 5,
    backgroundColor: 'transparent',
  },
  navigationItem: {
    flex: 1,
    minWidth: 0,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  navigationIconWrap: {
    minWidth: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationLabel: {
    color: '#59616D',
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
    textAlign: 'center',
  },
  navigationLabelActive: {
    color: NAVIGATION_RED,
    fontWeight: '700',
  },
  homeItem: {
    flex: 1,
    minWidth: 0,
    height: HOME_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  homeButton: {
    position: 'absolute',
    top:
      NAVIGATION_CRADLE_DROP
      - CENTER_BUTTON_RADIUS
      - (NAVIGATION_HEIGHT - HOME_ITEM_HEIGHT),
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10.5,
    elevation: 12,
  },
  homeLogo: {
    width: CENTER_LOGO_SIZE,
    height: CENTER_LOGO_SIZE,
    borderRadius: CENTER_LOGO_SIZE / 2,
  },
  badge: {
    position: 'absolute',
    right: -11,
    top: -6,
    minWidth: 21,
    height: 21,
    paddingHorizontal: 4,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVIGATION_RED,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  compactBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
  },
  compactBadgeText: {
    fontSize: 9.5,
  },
  unreadBell: {
    position: 'absolute',
    right: 14,
    zIndex: 30,
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E1E4E8',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 6,
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  moreSheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    paddingTop: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: colors.white,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetHandle: {
    width: 46,
    height: 5,
    marginBottom: 5,
    borderRadius: 3,
    alignSelf: 'center',
    backgroundColor: '#9AA1AA',
  },
  moreMenuItem: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  moreMenuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D8DCE1',
  },
  moreMenuLabel: {
    marginLeft: 19,
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
});
