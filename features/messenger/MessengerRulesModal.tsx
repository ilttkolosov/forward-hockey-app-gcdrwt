import Constants from "expo-constants";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { MessengerRulesVersion } from "./types";
import { getCurrentMessengerRules } from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";

interface Props {
  visible: boolean;
  rules?: MessengerRulesVersion | null;
  busy?: boolean;
  cancelLabel?: string;
  onAccept(
    rules: MessengerRulesVersion,
    appVersion: string,
    appBuild?: string,
  ): void | Promise<void>;
  onCancel(): void | Promise<void>;
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
  onAccept,
  onCancel,
}: Props) {
  const [rules, setRules] = useState<MessengerRulesVersion | null>(
    suppliedRules ?? null,
  );
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setChecked(false);
      setError(null);
      return;
    }
    if (suppliedRules) {
      setRules(suppliedRules);
      return;
    }
    let active = true;
    setLoading(true);
    getCurrentMessengerRules()
      .then((value) => active && setRules(value))
      .catch(
        (reason) =>
          active &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось загрузить Правила",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [suppliedRules, visible]);

  const appVersion = Constants.expoConfig?.version || "unknown";
  const appBuild =
    Constants.expoConfig?.ios?.buildNumber ||
    String(Constants.expoConfig?.android?.versionCode || "") ||
    undefined;
  const documentBlocks = useMemo(
    () => parseMarkdownBlocks(rules?.content_markdown || ""),
    [rules?.content_markdown],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => void onCancel()}
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
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              <ScrollView
                contentContainerStyle={styles.documentContent}
                nestedScrollEnabled
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
            accessibilityState={{ checked }}
            disabled={!rules || busy}
            style={styles.checkRow}
            onPress={() => setChecked((value) => !value)}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.checkText}>Принимаю условия использования</Text>
          </Pressable>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              disabled={busy}
              onPress={() => void onCancel()}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.acceptButton,
                (!checked || !rules || busy) && styles.disabled,
              ]}
              disabled={!checked || !rules || busy}
              onPress={() =>
                rules && void onAccept(rules, appVersion, appBuild)
              }
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptText}>Принимаю</Text>
              )}
            </TouchableOpacity>
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
  edition: { marginTop: 4, marginBottom: 10, color: colors.textSecondary },
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
  markdownHeadingOne: { marginBottom: 12, fontSize: 19, lineHeight: 25 },
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
  inlineCode: { fontFamily: "monospace", backgroundColor: colors.background },
  loader: { marginVertical: 80 },
  error: { padding: 18, color: colors.error },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
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
  actions: { flexDirection: "row", gap: 10 },
  cancelButton: {
    flex: 1,
    alignItems: "center",
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  acceptButton: {
    flex: 1,
    alignItems: "center",
    padding: 13,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.45 },
  cancelText: { color: colors.text, fontWeight: "600" },
  acceptText: { color: "#fff", fontWeight: "700" },
});
