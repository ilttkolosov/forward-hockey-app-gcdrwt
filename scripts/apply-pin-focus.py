from pathlib import Path
p=Path('app/messenger/room/[id].tsx');s=p.read_text()
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:80],s.count(a))
 s=s.replace(a,b)
rep('import { usePinnedMessageSelection } from "../../../features/messenger/usePinnedMessageSelection";', 'import { usePinnedMessageSelection } from "../../../features/messenger/usePinnedMessageSelection";\nimport { waitForMessengerFocus } from "../../../features/messenger/messageFocus";')
rep('''    messageId: string;
    attempts: number;
  } | null>(null);''','''    messageId: string;
    attempts: number;
    positioned: boolean;
    confirmed: boolean;
  } | null>(null);
  const messageNavigationGeneration = useRef(0);''')
rep('''  const positionMessageNavigationTarget = useCallback(() => {''','''  const cancelMessageNavigation = useCallback(() => {
    messageNavigationGeneration.current += 1;
    messageNavigationTarget.current = null;
    if (messageNavigationTimer.current) clearTimeout(messageNavigationTimer.current);
    messageNavigationTimer.current = null;
    setHighlightedMessageId(null);
  }, []);

  const positionMessageNavigationTarget = useCallback(() => {''')
a=s.index('  const positionMessageNavigationTarget');b=s.index('  const navigateToRepliedMessage',a)
s=s[:a]+'''  const positionMessageNavigationTarget = useCallback(() => {
    const target = messageNavigationTarget.current;
    if (!target || !listRef.current) return;
    const index = messagesRef.current.findIndex((message) => message.id === target.messageId);
    if (index < 0) return;
    target.positioned = true;
    // Repeated animations after content-size changes race each other on media rows.
    listRef.current.scrollToIndex({ index, animated: false, viewPosition: 0.45, viewOffset: 0 });
  }, []);

'''+s[b:]
a=s.index('  const navigateToRepliedMessage');b=s.index('\n  useEffect(() => {',a)
t=s[a:b]
t=t.replace('      beginManualFeedNavigation();','''      cancelMessageNavigation();
      const navigationGeneration = messageNavigationGeneration.current;
      const identity = pinIdentityRef.current;
      const currentNavigation = () => messageNavigationGeneration.current === navigationGeneration && pinIdentityRef.current === identity;
      beginManualFeedNavigation();''')
t=t.replace('''        let target =''','''        if (!currentNavigation()) return false;
        let target =''')
t=t.replace('''          sequence = target.sequence;''','''          if (!currentNavigation()) return false;
          sequence = target.sequence;''')
t=t.replace('''        if (context.length) {''','''        if (!currentNavigation() || target.deleted_at) return false;
        if (context.length) {''')
t=t.replace('''          attempts: 0,
        };''','''          attempts: 0,
          positioned: false,
          confirmed: false,
        };
        const focusTarget = messageNavigationTarget.current;''')
t=t.replace('''        return true;
      } catch (error) {''','''        const reached = await waitForMessengerFocus({
          isCurrent: () => currentNavigation() && messageNavigationTarget.current === focusTarget,
          isVisible: () => focusTarget.positioned && focusVisibleServerMessageIds.current.includes(target.id),
        });
        if (!reached) {
          if (currentNavigation()) {
            cancelMessageNavigation();
            setSyncError("Не удалось сфокусировать сообщение. Повторите переход.");
          }
          return false;
        }
        focusTarget.confirmed = true;
        setHighlightedMessageId(target.id);
        messageNavigationTimer.current = setTimeout(() => {
          if (!currentNavigation()) return;
          messageNavigationTimer.current = null;
          setHighlightedMessageId(null);
          // Keep the layout anchor for delayed media until manual/new navigation.
        }, 1800);
        return true;
      } catch (error) {
        if (!currentNavigation()) return false;
        cancelMessageNavigation();''')
t=t.replace('''      beginManualFeedNavigation,
      db,''','''      beginManualFeedNavigation,
      cancelMessageNavigation,
      db,''')
s=s[:a]+t+s[b:]
rep('''        navigationTarget.attempts += 1;''','''        navigationTarget.positioned = false;
        navigationTarget.attempts += 1;
        if (navigationTarget.attempts > 32) { cancelMessageNavigation(); return; }''')
rep('''    [positionInitialMessages, positionMessageNavigationTarget],''','''    [cancelMessageNavigation, positionInitialMessages, positionMessageNavigationTarget],''')
rep('''        setPushReactionAnimation(null);
        messageNavigationTarget.current = null;''','''        setPushReactionAnimation(null);
        messageNavigationGeneration.current += 1;
        messageNavigationTarget.current = null;''')
rep('''onScrollBeginDrag={() => { pinUserScroll.current = true; messageNavigationTarget.current = null; beginManualFeedNavigation(); }}''','''onScrollBeginDrag={() => { pinUserScroll.current = true; cancelMessageNavigation(); beginManualFeedNavigation(); }}''')
rep('''                resetPinSelection();
                void loadNewerMessages()''','''                cancelMessageNavigation();
                resetPinSelection();
                void loadNewerMessages()''')
rep('  const send = () => {','  const send = () => {\n    cancelMessageNavigation();\n    resetPinSelection();')
s=s.replace('  const viewableServerMessageIds = useRef<string[]>([]);','  const viewableServerMessageIds = useRef<string[]>([]);\n  const focusVisibleServerMessageIds = useRef<string[]>([]);')
needle='''  const initialViewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 1 }),
    [],
  );'''
assert needle in s
s=s.replace(needle,'''  // Preserve the 1% read/unread policy; navigation requires a fully visible
  // short row or at least half of the viewport for a large row.
  const viewableHandlerRef = useRef(handleViewableItemsChanged);
  viewableHandlerRef.current = handleViewableItemsChanged;
  const messageViewabilityPairs = useMemo(() => [
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 1 },
      onViewableItemsChanged: (info: { viewableItems: ViewToken<MessengerMessage>[] }) => viewableHandlerRef.current(info),
    },
    {
      viewabilityConfig: { viewAreaCoveragePercentThreshold: 50, minimumViewTime: 80 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken<MessengerMessage>[] }) => {
        focusVisibleServerMessageIds.current = viewableItems.filter((token) => token.isViewable).map((token) => token.item.id);
      },
    },
  ], []);''')
s=s.replace('''            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={initialViewabilityConfig}''','''            viewabilityConfigCallbackPairs={messageViewabilityPairs}''')
s=s.replace('''        viewableServerMessageIds.current = [];''','''        viewableServerMessageIds.current = [];
        focusVisibleServerMessageIds.current = [];''')
a=s.index('  const applyAuthorFilter = useCallback(');b=s.index('  const clearAuthorFilter',a);t=s[a:b].replace('      const filter = {','      cancelMessageNavigation();\n      const filter = {').replace('[loadFilteredAuthorMessages, roomType]','[cancelMessageNavigation, loadFilteredAuthorMessages, roomType]');s=s[:a]+t+s[b:]
p.write_text(s)
p=Path('features/messenger/PinnedMessagesBanner.tsx');s=p.read_text().replace('            key={item.message.id}', '            key={item.message.id}\n            testID={`pin-segment-${item.message.id}`}');s=s.replace('rail: { height: 48, width: 5,', 'rail: { height: 48, width: 5, flexShrink: 0,');p.write_text(s)
p=Path('docs/CHAT_PINNING.md');p.write_text(p.read_text()+'''\n\n## Подтверждение перехода\n\nСегменты имеют постоянные ключи ID сообщений. Посещённый сегмент и следующее\nпревью переключаются лишь после появления целевого сообщения в видимой области\nFlatList, а не сразу после команды прокрутки. Неизмеренная строка повторяется,\nошибка/ручная прокрутка/смена комнаты отменяют старый запрос без изменения сегмента.\nДля навигации проверяется полностью видимая короткая строка или половина экрана\nдля высокой строки; прежние правила прочтения сообщений не меняются.\nПодгрузка медиа не запускает конкурирующие анимации. Подсветка временная,\nно якорь сохраняется до нового действия пользователя.\n''')
