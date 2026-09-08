from pathlib import Path
import hashlib
p=Path('app/messenger/room/[id].tsx')
raw=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == '1a9496f0bbefaa4a1d782993f00f71b0d4e8d823'
s=raw.decode()
s=s.replace('import { currentMessengerPinId, nextMessengerPinId } from "../../../features/messenger/pins";', 'import { shouldResetPinAtLatest } from "../../../features/messenger/pins";\nimport { usePinnedMessageSelection } from "../../../features/messenger/usePinnedMessageSelection";')
s=s.replace('  const [pinSelection, setPinSelection] = useState<{ roomId: string; selected: string | null; visited: string | null }>({ roomId: "", selected: null, visited: null });', '''  const pinIdentity = `${session?.user.id ?? ""}:${roomId}`;
  const pinSelection = usePinnedMessageSelection(pins.items, pinIdentity, roomScreenActive);
  const resetPinSelection = pinSelection.resetToLatest;
  const pinIdentityRef = useRef(pinIdentity);
  pinIdentityRef.current = pinIdentity;
  const pinUserScroll = useRef(false);''')
s=s.replace('  const currentPinId = currentMessengerPinId(pins.items, pinSelection.roomId === roomId ? pinSelection.selected : null);', '  const currentPinId = pinSelection.currentId;')
s=s.replace('''      nearLatest.current = atLatest;
      setShowJumpToLatest''', '''      nearLatest.current = atLatest;
      if (pinUserScroll.current && contentOffset.y + layoutMeasurement.height >= contentSize.height - 4 && shouldResetPinAtLatest({
        distanceFromBottom: contentSize.height - contentOffset.y - layoutMeasurement.height,
        listReady, userScrolled: pinUserScroll.current, filtered: Boolean(authorFilter),
        navigating: pinNavigationLock.current,
        loadedSequence: [...messagesRef.current].reverse().find((message) => !message.pending)?.sequence ?? null,
        latestSequence: latestKnownSequence.current,
        hasMoreNewer: remoteHasMoreNewerMessages.current,
      })) {
        pinUserScroll.current = false;
        resetPinSelection();
      }
      setShowJumpToLatest''')
start=s.index('  const handleListScroll = useCallback(');end=s.index('  const scheduleConnectionSync', start)
s=s[:start]+s[start:end].replace('      listReady,\n', '      listReady,\n      resetPinSelection,\n')+s[end:]
s=s.replace('''    pinNavigationLock.current = true;
    setPinNavigationBusy(true);''', '''    const selectionRevision = pinSelection.getRevision();
    pinNavigationLock.current = true;
    pinUserScroll.current = false;
    setPinNavigationBusy(true);''')
s=s.replace('''      if (await navigateToRepliedMessage(pin.message)) {
        setPinSelection({ roomId, visited: pin.message.id, selected: nextMessengerPinId(pins.items, pin.message.id) });
      }''', '''      if (await navigateToRepliedMessage(pin.message) && pinIdentityRef.current === pinIdentity) {
        pinSelection.visit(pin.message.id, selectionRevision);
      }''')
s=s.replace('navigateToRepliedMessage, pins.items, roomId]);', 'navigateToRepliedMessage, pinIdentity, pinSelection, pins.items]);')
s=s.replace('if (!pinned) setPinSelection({ roomId, selected: message.id, visited: null });', 'if (!pinned && pinIdentityRef.current === pinIdentity) pinSelection.select(message.id);')
s=s.replace('  }, [pins, roomId]);', '  }, [pinIdentity, pinSelection, pins]);')
s=s.replace('visitedId={pinSelection.roomId === roomId ? pinSelection.visited : null}', 'visitedId={pinSelection.visitedId}\n          accessToken={session?.access_token ?? ""}\n          active={roomScreenActive}')
s=s.replace('onScrollBeginDrag={beginManualFeedNavigation}', 'onScrollBeginDrag={() => { pinUserScroll.current = true; beginManualFeedNavigation(); }}')
s=s.replace('                void loadNewerMessages().finally(() => scrollToLatest(true));', '                resetPinSelection();\n                void loadNewerMessages().finally(() => scrollToLatest(true));')
assert 'setPinSelection' not in s
p.write_text(s)
p=Path('docs/CHAT_PINNING.md')
s=p.read_text().replace('Сообщения идут от новых к старым по серверному bigint sequence без потери точности.', 'Сообщения идут от старых к новым по created_at самого сообщения. Время закрепления\nи редактирования не влияет на порядок; bigint sequence используется только для\nстабильного порядка при одинаковом времени, без потери точности.')
s+='''\n## Полоса закрепления\n\nПри входе/повторном открытии чата и при ручной прокрутке к действительному концу\nленты выбирается последнее (самое новое по created_at) закреплённое сообщение.\nНиз страницы старой истории и программный переход к закреплению выбор не сбрасывают.\nПосле последнего сообщения цикл переходит к первому. Счётчик визуально не выводится:\nзаголовок всегда «Закрепленное сообщение», а ниже — начало первой строки или Фото/Видео.\nСлева от текста, после сегментов — квадратная миниатюра первого фото/видео вложения,\nсправа — значок строк с булавкой (часть той же кнопки перехода, не отдельное действие).\nКадр видео извлекается в момент 0 с, без воспроизведения и звука, средствами уже\nустановленного expo-video; плеер освобождается по завершении, ошибке или выходе.\nНа недоступном вложении остаётся значок типа. Новых native-зависимостей нет.\n'''
p.write_text(s)
