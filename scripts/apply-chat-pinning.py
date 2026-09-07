from pathlib import Path

def replace(path, before, after):
    p = Path(path)
    source = p.read_text()
    assert source.count(before) == 1, (path, before[:80], source.count(before))
    p.write_text(source.replace(before, after))

p = 'app/messenger/room/[id].tsx'
replace(p, 'import MessageReceiptsModal from "../../../features/messenger/MessageReceiptsModal";', '''import MessageReceiptsModal from "../../../features/messenger/MessageReceiptsModal";
import PinnedMessagesBanner from "../../../features/messenger/PinnedMessagesBanner";
import { usePinnedMessages } from "../../../features/messenger/usePinnedMessages";
import { currentMessengerPinId, nextMessengerPinId } from "../../../features/messenger/pins";''')
replace(p, '  const [roomScreenActive, setRoomScreenActive] = useState(false);', '''  const [roomScreenActive, setRoomScreenActive] = useState(false);
  const pins = usePinnedMessages(roomId, session?.user.id, roomScreenActive);
  const [pinSelection, setPinSelection] = useState<{ roomId: string; selected: string | null; visited: string | null }>({ roomId: "", selected: null, visited: null });
  const [pinNavigationBusy, setPinNavigationBusy] = useState(false);
  const pinNavigationLock = useRef(false);
  const currentPinId = currentMessengerPinId(pins.items, pinSelection.roomId === roomId ? pinSelection.selected : null);''')
s = Path(p).read_text()
start = s.index('  const navigateToRepliedMessage = useCallback(')
end = s.index('\n  useEffect(() => {', start)
block = s[start:end].replace('        return;', '        return true;', 1)
block = block.replace('''          requestAnimationFrame(positionMessageNavigationTarget),
        );''', '''          requestAnimationFrame(positionMessageNavigationTarget),
        );
        return true;''')
block = block.replace('''          messengerErrorMessage(error, "Не удалось открыть исходное сообщение"),
        );''', '''          messengerErrorMessage(error, "Не удалось открыть исходное сообщение"),
        );
        return false;''')
assert 'return false' in block and block.count('return true') == 2
Path(p).write_text(s[:start] + block + s[end:])
replace(p, '  const openForward = useCallback(async (message: MessengerMessage) => {', '''  const navigateToPinnedMessage = useCallback(async () => {
    const pin = pins.items.find((item) => item.message.id === currentPinId);
    if (!pin || pinNavigationLock.current) return;
    pinNavigationLock.current = true;
    setPinNavigationBusy(true);
    try {
      if (authorFilter) clearAuthorFilter();
      // Let the unfiltered FlatList commit before requesting its target index.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (await navigateToRepliedMessage(pin.message)) {
        setPinSelection({ roomId, visited: pin.message.id, selected: nextMessengerPinId(pins.items, pin.message.id) });
      }
    } finally {
      pinNavigationLock.current = false;
      setPinNavigationBusy(false);
    }
  }, [authorFilter, clearAuthorFilter, currentPinId, navigateToRepliedMessage, pins.items, roomId]);

  const toggleMessagePinned = useCallback(async (message: MessengerMessage) => {
    const pinned = pins.items.some((item) => item.message.id === message.id);
    setActionMessage(null);
    try {
      await pins.setPinned(message.id, !pinned);
      if (!pinned) setPinSelection({ roomId, selected: message.id, visited: null });
    } catch (error) {
      Alert.alert("Закрепление сообщения", messengerErrorMessage(error, "Не удалось изменить закрепление"));
    }
  }, [pins, roomId]);

  const openForward = useCallback(async (message: MessengerMessage) => {''')
replace(p, '        {authorFilter && (', '''        <PinnedMessagesBanner
          items={pins.items}
          messageId={currentPinId}
          visitedId={pinSelection.roomId === roomId ? pinSelection.visited : null}
          busy={pinNavigationBusy}
          onPress={() => void navigateToPinnedMessage()}
        />

        {authorFilter && (''')
replace(p, '                {actionMessageEditable && actionMessage ? (', '''                {actionMessage && pins.canPin && !actionMessage.pending && !actionMessage.deleted_at && actionMessage.kind !== "system" ? (
                  <TouchableOpacity style={styles.messageAction} disabled={pins.busy}
                    onPress={() => void toggleMessagePinned(actionMessage)}>
                    <Icon name="pin-outline" size={21} color={colors.primary} />
                    <Text style={styles.messageActionText}>
                      {pins.items.some((item) => item.message.id === actionMessage.id) ? "Открепить сообщение" : "Закрепить сообщение"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {actionMessageEditable && actionMessage ? (''')
replace(p, '          <View style={styles.systemMessage}>', '''          <Pressable style={styles.systemMessage} disabled={!item.reply_to}
            accessibilityRole={item.reply_to ? "button" : undefined}
            accessibilityHint={item.reply_to ? "Перейти к исходному сообщению" : undefined}
            onPress={() => { if (item.reply_to) onNavigateToReply(item.reply_to); }}>''')
replace(p, '          </View>\n        </View>\n      </View>\n    );\n  }\n\n  return (', '          </Pressable>\n        </View>\n      </View>\n    );\n  }\n\n  return (')
replace('services/messengerRealtime.ts', '  | { type: "room.updated"; room_id: string; deleted?: boolean }', '  | { type: "room.updated"; room_id: string; deleted?: boolean }\n  | { type: "room.pins_updated"; room_id: string }')
replace('services/messengerRealtime.ts', '  nextSocket.on(\n    "room.updated",', '  nextSocket.on("room.pins_updated", (payload: { room_id: string }) =>\n    publish({ type: "room.pins_updated", room_id: payload.room_id }),\n  );\n  nextSocket.on(\n    "room.updated",')
replace('.github/workflows/quality.yml', '      - name: Validate Expo config', '      - name: Verify pinned message ordering and previews\n        run: node --no-warnings --experimental-strip-types checks/messenger-pins.mjs\n\n      - name: Validate Expo config')
