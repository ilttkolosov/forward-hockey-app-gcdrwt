import Constants from "expo-constants";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MessengerRulesVersion } from "./types";
import {
  getCurrentMessengerRules,
  MessengerApiError,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { messengerLog } from "../../services/messengerLogger";
import { colors } from "../../styles/commonStyles";

interface Props {
  visible: boolean;
  rules?: MessengerRulesVersion | null;
  busy?: boolean;
  cancelLabel?: string;
  flow?: "registration" | "authenticated";
  onAccept(
    rules: MessengerRulesVersion,
    appVersion: string,
    appBuild?: string,
  ): void | Promise<void>;
  onCancel(): void | Promise<void>;
  onDismiss?(): void;
}

type MarkdownBlock =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "listItem"; marker: string; content: string };

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", content: paragraph.join("\n") });
    paragraph = [];
  };

  markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        flushParagraph();
        return;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        blocks.push({
          type: "heading",
          level: heading[1].length,
          content: heading[2],
        });
        return;
      }
      const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
      if (unorderedItem) {
        flushParagraph();
        blocks.push({
          type: "listItem",
          marker: "•",
          content: unorderedItem[1],
        });
        return;
      }
      const orderedItem = line.match(/^\s*(\d+)\.\s+(.+)$/);
      if (orderedItem) {
        flushParagraph();
        blocks.push({
          type: "listItem",
          marker: `${orderedItem[1]}.`,
          content: orderedItem[2],
        });
        return;
      }
      paragraph.push(line.trim());
    });
  flushParagraph();
  return blocks;
}

function renderInlineMarkdown(content: string): React.ReactNode[] {
  const parts = content.split(
    /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g,
  );
  return parts.filter(Boolean).map((part, index) => {
    const key = `${index}-${part}`;
    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return (
        <Text key={key} style={styles.inlineStrong}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={key} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return (
        <Text key={key} style={styles.inlineEmphasis}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

export default function MessengerRulesModal({
  visible,
  rules: suppliedRules,
  busy = false,
  cancelLabel = "Отмена",
  flow = "authenticated",
  onAccept,
  onCancel,
  onDismiss,
}: Props) {
  const [rules, setRules] = useState<MessengerRulesVersion | null>(
    suppliedRules ?? null,
  );
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalReady, setModalReady] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setChecked(false);
      setLoadError(null);
      setActionError(null);
      setModalReady(false);
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    messengerLog("info", "rules.modal.opened", { flow });
    if (suppliedRules) {
      setRules(suppliedRules);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getCurrentMessengerRules()
      .then((value) => {
        if (!active) return;
        setRules(value);
        setLoadError(null);
      })
      .catch((reason) => {
        if (!active) return;
        setLoadError(
          messengerErrorMessage(reason, "Не удалось загрузить Правила"),
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [flow, suppliedRules, visible]);

  const appVersion = Constants.expoConfig?.version || "unknown";
  const appBuild =
    Constants.expoConfig?.ios?.buildNumber ||
    String(Constants.expoConfig?.android?.versionCode || "") ||
    undefined;
  const documentBlocks = useMemo(
    () => parseMarkdownBlocks(rules?.content_markdown || ""),
    [rules?.content_markdown],
  );
  const actionBusy = busy || submitting;
  const acceptDisabled =
    !modalReady || !checked || !rules || actionBusy || loading;

  const reloadRulesAfterConflict = useCallback(async () => {
    try {
      const latest = await getCurrentMessengerRules();
      setRules(latest);
      setChecked(false);
      setLoadError(null);
    } catch {
      // The original actionable error remains visible. A later retry
      // will fetch current rules again if the connection recovers.
    }
  }, []);

  const handleAccept = useCallback(async () => {
    if (submittingRef.current || busy || !modalReady || !checked || !rules) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    const startedAt = Date.now();
    messengerLog("info", "rules.accept.started", {
      flow,
      rules_version: rules.version,
    });
    try {
      await onAccept(rules, appVersion, appBuild);
      messengerLog("info", "rules.accept.succeeded", {
        flow,
        rules_version: rules.version,
        duration_ms: Date.now() - startedAt,
      });
    } catch (reason) {
      if (
        reason instanceof MessengerApiError &&
        reason.code === "rules_version_changed"
      ) {
        await reloadRulesAfterConflict();
      }
      const message = messengerErrorMessage(
        reason,
        "Не удалось завершить регистрацию. Проверьте соединение и повторите попытку.",
      );
      setActionError(message);
      messengerLog("warn", "rules.accept.failed", {
        flow,
        duration_ms: Date.now() - startedAt,
        error_code:
          reason instanceof MessengerApiError ? reason.code : "client_error",
        message,
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    appBuild,
    appVersion,
    busy,
    checked,
    flow,
    modalReady,
    onAccept,
    reloadRulesAfterConflict,
    rules,
  ]);

  const handleCancel = useCallback(async () => {
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      await onCancel();
    } catch (reason) {
      const message = messengerErrorMessage(
        reason,
        "Не удалось отменить регистрацию. Повторите попытку.",
      );
      setActionError(message);
      messengerLog("warn", "rules.cancel.failed", { flow, message });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [busy, flow, onCancel]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={() => {
        setModalReady(true);
        messengerLog("info", "rules.modal.shown", { flow });
      }}
      onRequestClose={() => void handleCancel()}
      onDismiss={() => {
        messengerLog("info", "rules.modal.dismissed", { flow });
        onDismiss?.();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Правила пользования</Text>
          {rules ? (
            <Text style={styles.edition}>
              Версия {rules.version} от {rules.edition_date}
            </Text>
          ) : null}
          <View style={styles.document}>
            {loading ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : loadError ? (
              <Text style={styles.error}>{loadError}</Text>
            ) : (
              <ScrollView
                contentContainerStyle={styles.documentContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
              >
                {documentBlocks.map((block, index) => {
                  const key = `${block.type}-${index}`;
                  if (block.type === "heading") {
                    return (
                      <Text
                        key={key}
                        selectable
                        style={[
                          styles.markdownHeading,
                          block.level === 1
                            ? styles.markdownHeadingOne
                            : styles.markdownHeadingOther,
                        ]}
                      >
                        {renderInlineMarkdown(block.content)}
                      </Text>
                    );
                  }
                  if (block.type === "listItem") {
                    return (
                      <View key={key} style={styles.markdownListItem}>
                        <Text style={styles.markdownBullet}>
                          {block.marker}
                        </Text>
                        <Text selectable style={styles.markdownParagraph}>
                          {renderInlineMarkdown(block.content)}
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <Text key={key} selectable style={styles.markdownParagraph}>
                      {renderInlineMarkdown(block.content)}
                    </Text>
                  );
                })}
              </ScrollView>
            )}
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{
              checked,
              disabled: !rules || actionBusy,
            }}
            disabled={!rules || actionBusy}
            hitSlop={8}
            style={({ pressed }) => [
              styles.checkRow,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              const next = !checked;
              setChecked(next);
              setActionError(null);
              messengerLog("info", "rules.checkbox.changed", {
                flow,
                checked: next,
              });
            }}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.checkText}>Принимаю условия использования</Text>
          </Pressable>
          {actionError ? (
            <Text accessibilityRole="alert" style={styles.actionError}>
              {actionError}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={actionBusy}
              hitSlop={8}
              style={({ pressed }) => [
                styles.cancelButton,
                actionBusy && styles.disabled,
                pressed && !actionBusy && styles.pressed,
              ]}
              onPress={() => void handleCancel()}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: acceptDisabled,
                busy: actionBusy,
              }}
              disabled={acceptDisabled}
              hitSlop={10}
              style={({ pressed }) => [
                styles.acceptButton,
                acceptDisabled && styles.disabled,
                pressed && !acceptDisabled && styles.pressed,
              ]}
              onPressIn={() => {
                if (!acceptDisabled) {
                  messengerLog("info", "rules.accept.press_in", { flow });
                }
              }}
              onPress={() => {
                messengerLog("info", "rules.accept.press", { flow });
                void handleAccept();
              }}
            >
              {actionBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptText}>Принимаю</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 16,
  },
  card: {
    maxHeight: "92%",
    borderRadius: 18,
    backgroundColor: colors.background,
    padding: 18,
  },
  title: { fontSize: 21, fontWeight: "700", color: colors.text },
  edition: {
    marginTop: 4,
    marginBottom: 10,
    color: colors.textSecondary,
  },
  document: {
    minHeight: 240,
    flexShrink: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  documentContent: { padding: 14 },
  markdownHeading: { color: colors.text, fontWeight: "700" },
  markdownHeadingOne: {
    marginBottom: 12,
    fontSize: 19,
    lineHeight: 25,
  },
  markdownHeadingOther: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 16,
    lineHeight: 22,
  },
  markdownParagraph: {
    flex: 1,
    marginBottom: 9,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  markdownListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 4,
  },
  markdownBullet: {
    width: 18,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
  },
  inlineStrong: { fontWeight: "700" },
  inlineEmphasis: { fontStyle: "italic" },
  inlineCode: {
    fontFamily: "monospace",
    backgroundColor: colors.background,
  },
  loader: { marginVertical: 80 },
  error: { padding: 18, color: colors.error },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingVertical: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkmark: { color: "#fff", fontWeight: "800" },
  checkText: { flex: 1, fontSize: 15, color: colors.text },
  actionError: {
    marginTop: -4,
    marginBottom: 12,
    color: colors.error,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 10 },
  cancelButton: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  acceptButton: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  cancelText: { color: colors.text, fontWeight: "600" },
  acceptText: { color: "#fff", fontWeight: "700" },
});
