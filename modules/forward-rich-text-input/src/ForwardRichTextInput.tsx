import Constants, { ExecutionEnvironment } from "expo-constants";
import {
  requireNativeViewManager,
  requireOptionalNativeModule,
} from "expo-modules-core";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Platform,
  TextInput,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextStyle,
  type TextInputProps,
} from "react-native";

interface NativeValueChangeEvent {
  value: string;
}

interface NativeContentSizeChangeEvent {
  height: number;
}

interface NativePasteAttachmentEvent {
  kind?: "image" | "video" | "file";
  uri?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  clipboardImage?: boolean;
  error?: string;
}

export interface ForwardRichTextPastedAttachment {
  kind?: "image" | "video" | "file";
  uri?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  clipboardImage?: boolean;
  error?: string;
}

interface NativeForwardRichTextInputProps {
  style?: StyleProp<TextStyle>;
  value: string;
  placeholder?: string;
  maxLength?: number;
  editable?: boolean;
  pasteAttachmentsEnabled?: boolean;
  fontSize?: number;
  textColor?: string;
  placeholderTextColor?: string;
  selectionColor?: string;
  onValueChange?: (
    event: NativeSyntheticEvent<NativeValueChangeEvent>,
  ) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onContentSizeChange?: (
    event: NativeSyntheticEvent<NativeContentSizeChangeEvent>,
  ) => void;
  onPasteAttachment?: (
    event: NativeSyntheticEvent<NativePasteAttachmentEvent>,
  ) => void;
}

interface NativeForwardRichTextInputRef {
  focusEditor(): Promise<void>;
  blurEditor(): Promise<void>;
}

export interface ForwardRichTextInputHandle {
  focus(): void;
  blur(): void;
}

export interface ForwardRichTextInputProps {
  style?: StyleProp<TextStyle>;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  editable?: boolean;
  pasteAttachmentsEnabled?: boolean;
  fontSize?: number;
  textColor?: string;
  placeholderTextColor?: string;
  selectionColor?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onContentSizeChange?: (height: number) => void;
  onPasteAttachment?: (attachment: ForwardRichTextPastedAttachment) => void;
  selection?: { start: number; end: number };
  onSelectionChange?: (selection: { start: number; end: number }) => void;
}

type NativeComponent = React.ComponentType<
  NativeForwardRichTextInputProps & {
    ref?: React.Ref<NativeForwardRichTextInputRef>;
  }
>;

let cachedNativeComponent: NativeComponent | null | undefined;

function getNativeComponent(): NativeComponent | null {
  if (cachedNativeComponent !== undefined) return cachedNativeComponent;
  if (
    Platform.OS === "web" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    cachedNativeComponent = null;
    return cachedNativeComponent;
  }

  // requireNativeViewManager can still create a Fabric component placeholder
  // when the JS bundle is newer than the installed native binary. Rendering
  // that placeholder produces a visible "Unimplemented component" error, so
  // verify that the native module exists before requiring its view manager.
  if (!requireOptionalNativeModule("ForwardRichTextInput")) {
    cachedNativeComponent = null;
    return cachedNativeComponent;
  }

  try {
    cachedNativeComponent = requireNativeViewManager<NativeForwardRichTextInputProps>(
      "ForwardRichTextInput",
    ) as NativeComponent;
  } catch {
    // Expo Go and an old installed build do not contain this local module.
    // Keeping a normal TextInput fallback lets the JS bundle remain usable,
    // while native formatting is intentionally limited to a development build.
    cachedNativeComponent = null;
  }
  return cachedNativeComponent;
}

export const ForwardRichTextInput = forwardRef<
  ForwardRichTextInputHandle,
  ForwardRichTextInputProps
>(function ForwardRichTextInput(
  {
    style,
    value,
    onChangeText,
    placeholder,
    maxLength,
    editable = true,
    pasteAttachmentsEnabled = false,
    fontSize = 16,
    textColor = "#1F3347",
    placeholderTextColor = "#8A969C",
    selectionColor = "#2F80ED",
    onFocus,
    onBlur,
    onContentSizeChange,
    onPasteAttachment,
    selection,
    onSelectionChange,
  },
  forwardedRef,
) {
  const nativeRef = useRef<NativeForwardRichTextInputRef>(null);
  const fallbackRef = useRef<TextInput>(null);
  const NativeView = useMemo(getNativeComponent, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus() {
        if (NativeView) void nativeRef.current?.focusEditor();
        else fallbackRef.current?.focus();
      },
      blur() {
        if (NativeView) void nativeRef.current?.blurEditor();
        else fallbackRef.current?.blur();
      },
    }),
    [NativeView],
  );

  const handleNativeChange = useCallback(
    (event: NativeSyntheticEvent<NativeValueChangeEvent>) => {
      onChangeText(event.nativeEvent.value);
    },
    [onChangeText],
  );

  const handleNativeContentSize = useCallback(
    (event: NativeSyntheticEvent<NativeContentSizeChangeEvent>) => {
      onContentSizeChange?.(event.nativeEvent.height);
    },
    [onContentSizeChange],
  );

  const handleNativePasteAttachment = useCallback(
    (event: NativeSyntheticEvent<NativePasteAttachmentEvent>) => {
      onPasteAttachment?.(event.nativeEvent);
    },
    [onPasteAttachment],
  );

  if (!NativeView) {
    const fallbackProps: TextInputProps = {
      style: [
        style,
        {
          color: textColor,
          fontSize,
          paddingHorizontal: 14,
          paddingVertical: 11,
        },
      ],
      value,
      onChangeText,
      placeholder,
      placeholderTextColor,
      selectionColor,
      maxLength,
      editable,
      multiline: true,
      onFocus,
      onBlur,
      onContentSizeChange: (event) =>
        onContentSizeChange?.(event.nativeEvent.contentSize.height),
      selection,
      onSelectionChange: (event) =>
        onSelectionChange?.(event.nativeEvent.selection),
    };
    return <TextInput ref={fallbackRef} {...fallbackProps} />;
  }

  return (
    <NativeView
      ref={nativeRef}
      style={style}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      editable={editable}
      pasteAttachmentsEnabled={pasteAttachmentsEnabled}
      fontSize={fontSize}
      textColor={textColor}
      placeholderTextColor={placeholderTextColor}
      selectionColor={selectionColor}
      onValueChange={handleNativeChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onContentSizeChange={handleNativeContentSize}
      onPasteAttachment={handleNativePasteAttachment}
    />
  );
});
