import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch anchor not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchRoom() {
  const path = "app/messenger/room/[id].tsx";
  let source = fs.readFileSync(path, "utf8");

  source = replaceOnce(
    source,
    'import MessageReceiptsModal from "../../../features/messenger/MessageReceiptsModal";\n',
    'import MessageReceiptsModal from "../../../features/messenger/MessageReceiptsModal";\nimport { MessengerReportDialog } from "../../../features/messenger/MessengerSafetyActions";\n',
    "room report dialog import",
  );

  source = replaceOnce(
    source,
    `  const [actionMessage, setActionMessage] = useState<MessengerMessage | null>(\n    null,\n  );\n`,
    `  const [actionMessage, setActionMessage] = useState<MessengerMessage | null>(\n    null,\n  );\n  const [reportMessage, setReportMessage] = useState<MessengerMessage | null>(\n    null,\n  );\n`,
    "room report message state",
  );

  source = replaceOnce(
    source,
    `  const pendingMessageAction = useRef<\n    | { type: "forward"; message: MessengerMessage }\n    | { type: "receipts"; message: MessengerMessage }\n    | { type: "private_reply"; message: MessengerMessage }\n    | null\n  >(null);\n`,
    `  const pendingMessageAction = useRef<\n    | { type: "forward"; message: MessengerMessage }\n    | { type: "receipts"; message: MessengerMessage }\n    | { type: "private_reply"; message: MessengerMessage }\n    | { type: "report"; message: MessengerMessage }\n    | null\n  >(null);\n`,
    "room pending report action type",
  );

  source = replaceOnce(
    source,
    `    if (pending.type === "forward") void openForward(pending.message);\n    else if (pending.type === "receipts") void openReceipts(pending.message);\n    else void openPrivateReply(pending.message);\n  }, [openForward, openPrivateReply, openReceipts]);\n`,
    `    if (pending.type === "forward") void openForward(pending.message);\n    else if (pending.type === "receipts") void openReceipts(pending.message);\n    else if (pending.type === "private_reply")\n      void openPrivateReply(pending.message);\n    else setReportMessage(pending.message);\n  }, [openForward, openPrivateReply, openReceipts]);\n`,
    "room pending report action handler",
  );

  source = replaceOnce(
    source,
    `      type: "forward" | "receipts" | "private_reply",\n`,
    `      type: "forward" | "receipts" | "private_reply" | "report",\n`,
    "room queue report action union",
  );

  const forwardAction = `              {actionMessage &&\n              !actionMessage.pending &&\n              !actionMessage.deleted_at ? (\n                <TouchableOpacity\n                  style={styles.messageAction}\n                  onPress={() => queueMessageAction("forward", actionMessage)}\n                >\n                  <Icon name="arrow-redo" size={21} color={colors.primary} />\n                  <Text style={styles.messageActionText}>Переслать</Text>\n                </TouchableOpacity>\n              ) : null}\n`;
  source = replaceOnce(
    source,
    forwardAction,
    `${forwardAction}              {actionMessage &&\n              !actionMessage.pending &&\n              !actionMessage.deleted_at &&\n              actionMessage.kind !== "system" &&\n              actionMessage.author.id !== session?.user.id ? (\n                <TouchableOpacity\n                  style={styles.messageAction}\n                  onPress={() => queueMessageAction("report", actionMessage)}\n                  accessibilityRole="button"\n                  accessibilityLabel="Пожаловаться на сообщение"\n                >\n                  <Icon name="flag-outline" size={21} color={colors.error} />\n                  <Text\n                    style={[styles.messageActionText, { color: colors.error }]}\n                  >\n                    Пожаловаться\n                  </Text>\n                </TouchableOpacity>\n              ) : null}\n`,
    "room report message action",
  );

  source = replaceOnce(
    source,
    `        <MessageReceiptsModal\n`,
    `        <MessengerReportDialog\n          visible={Boolean(reportMessage)}\n          targetUserId={reportMessage?.author.id || ""}\n          targetDisplayName={reportMessage?.author.display_name || ""}\n          roomId={roomId}\n          messageId={reportMessage?.id}\n          onClose={() => setReportMessage(null)}\n        />\n\n        <MessageReceiptsModal\n`,
    "room report dialog render",
  );

  fs.writeFileSync(path, source);
}

function patchProfile() {
  const path = "app/messenger/profile.tsx";
  let source = fs.readFileSync(path, "utf8");
  const dangerAnchor = `          <View style={styles.dangerCard}>\n`;
  const safetyCard = `          <TouchableOpacity\n            style={styles.cacheCard}\n            onPress={() => router.push("/messenger/safety")}\n            accessibilityRole="button"\n            accessibilityLabel="Открыть центр безопасности"\n          >\n            <View style={styles.cacheIcon}>\n              <Icon\n                name="shield-checkmark-outline"\n                size={25}\n                color={colors.primary}\n              />\n            </View>\n            <View style={styles.cacheText}>\n              <Text style={styles.cacheTitle}>Безопасность</Text>\n              <Text style={styles.cacheSubtitle}>\n                Правила, жалобы и заблокированные пользователи\n              </Text>\n            </View>\n            <Icon\n              name="chevron-forward"\n              size={20}\n              color={colors.textSecondary}\n            />\n          </TouchableOpacity>\n\n`;
  source = replaceOnce(
    source,
    dangerAnchor,
    safetyCard + dangerAnchor,
    "profile safety center link",
  );
  fs.writeFileSync(path, source);
}

patchRoom();
patchProfile();
console.log("App Store compliance patches applied successfully.");
