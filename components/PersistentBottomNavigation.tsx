import React, { ReactNode, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Href, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useMessengerAuth } from '../contexts/MessengerAuthContext';
import { useMessengerUnreadSnapshot } from '../services/messengerUnread';
import { colors } from '../styles/commonStyles';

const NAVIGATION_RED = '#F2162D';
const NAVIGATION_HEIGHT = 70;
const CENTER_BUTTON_SIZE = 68;

type NavigationSection =
  | 'trainings'
  | 'tournaments'
  | 'home'
  | 'messenger'
  | 'more';

interface PersistentBottomNavigationProps {
  children: ReactNode;
}

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

const MORE_MENU_ITEMS: MoreMenuItem[] = [
  { href: '/mobilegames', icon: 'game-controller-outline', label: 'Игры' },
  { href: '/players', icon: 'people-outline', label: 'Игроки' },
  { href: '/settings', icon: 'settings-outline', label: 'Настройки' },
  { href: '/about', icon: 'information-circle-outline', label: 'О программе' },
];

const formatUnreadCount = (count: number) => (count > 99 ? '99+' : String(count));

const isMobileGameRoute = (pathname: string) => (
  pathname.startsWith('/mobilegames/')
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

export default function PersistentBottomNavigation({
  children,
}: PersistentBottomNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useMessengerAuth();
  const unread = useMessengerUnreadSnapshot();
  const [moreVisible, setMoreVisible] = useState(false);

  const messengerHref: Href = isAuthenticated
    ? '/messenger/rooms'
    : '/messenger/register';
  const activeSection = useMemo(() => activeSectionForPath(pathname), [pathname]);
  const unreadCount = isAuthenticated && unread.ready ? unread.count : 0;
  const navigationHidden = isMobileGameRoute(pathname);
  const showUnreadBell = unreadCount > 0 && !pathname.startsWith('/messenger');

  const navigate = (href: Href) => {
    setMoreVisible(false);
    router.navigate(href);
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>

      {!navigationHidden && (
        <>
          {showUnreadBell && (
            <TouchableOpacity
              accessibilityLabel={`Открыть общение, непрочитанных сообщений: ${unreadCount}`}
              accessibilityRole="button"
              activeOpacity={0.72}
              hitSlop={8}
              onPress={() => navigate(messengerHref)}
              style={[styles.unreadBell, { top: insets.top + 8 }]}
            >
              <Icon name="notifications-outline" size={25} color={colors.text} />
              <UnreadBadge count={unreadCount} compact />
            </TouchableOpacity>
          )}

          <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 6) }]}>
            <NavigationItem
              accessibilityLabel="Открыть тренировки"
              active={activeSection === 'trainings'}
              icon="barbell-outline"
              label="Тренировки"
              onPress={() => navigate('/trainings')}
            />
            <NavigationItem
              accessibilityLabel="Открыть турниры"
              active={activeSection === 'tournaments'}
              icon="trophy-outline"
              label="Турниры"
              onPress={() => navigate('/tournaments')}
            />

            <TouchableOpacity
              accessibilityLabel="Открыть главную страницу"
              accessibilityRole="button"
              accessibilityState={{ selected: activeSection === 'home' }}
              activeOpacity={0.78}
              hitSlop={{ top: 26, right: 5, bottom: 4, left: 5 }}
              onPress={() => navigate('/')}
              style={styles.homeItem}
            >
              <View style={[styles.homeButton, activeSection === 'home' && styles.homeButtonActive]}>
                <Image
                  resizeMode="contain"
                  source={require('../assets/icons/myIcon.png')}
                  style={styles.homeLogo}
                />
              </View>
              <Text style={[styles.navigationLabel, activeSection === 'home' && styles.navigationLabelActive]}>
                Главная
              </Text>
            </TouchableOpacity>

            <NavigationItem
              accessibilityLabel="Открыть общение"
              active={activeSection === 'messenger'}
              badge={unreadCount}
              icon="chatbubble-ellipses-outline"
              label="Общение"
              onPress={() => navigate(messengerHref)}
            />
            <NavigationItem
              accessibilityLabel="Открыть дополнительное меню"
              active={activeSection === 'more' || moreVisible}
              icon="ellipsis-horizontal"
              label="Ещё"
              onPress={() => setMoreVisible(true)}
            />
          </View>

          <Modal
            animationType="slide"
            onRequestClose={() => setMoreVisible(false)}
            statusBarTranslucent
            transparent
            visible={moreVisible}
          >
            <View style={styles.modalRoot}>
              <Pressable
                accessibilityLabel="Закрыть дополнительное меню"
                accessibilityRole="button"
                onPress={() => setMoreVisible(false)}
                style={styles.backdrop}
              />
              <View
                style={[
                  styles.moreSheet,
                  { marginBottom: NAVIGATION_HEIGHT + Math.max(insets.bottom, 6) },
                ]}
              >
                <View style={styles.sheetHandle} />
                {MORE_MENU_ITEMS.map((item, index) => (
                  <TouchableOpacity
                    accessibilityLabel={`Открыть раздел «${item.label}»`}
                    accessibilityRole="button"
                    activeOpacity={0.68}
                    key={item.label}
                    onPress={() => navigate(item.href)}
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
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  navigation: {
    minHeight: NAVIGATION_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 7,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE1E7',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
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
    height: 67,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  homeButton: {
    position: 'absolute',
    top: -25,
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 9,
  },
  homeButtonActive: {
    borderColor: NAVIGATION_RED,
  },
  homeLogo: {
    width: 62,
    height: 62,
    borderRadius: 31,
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  moreSheet: {
    marginHorizontal: 10,
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
