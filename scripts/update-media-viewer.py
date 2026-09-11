from pathlib import Path
p=Path('features/messenger/MessengerMediaViewer.tsx')
s=p.read_text().replace('useEffect, useState','useCallback, useEffect, useMemo, useRef, useState')
s=s.replace('import { GestureHandlerRootView }','import { Gesture, GestureDetector, GestureHandlerRootView }')
s=s.replace('import type { MessengerMedia }','import { useMediaViewerLoading } from "./useMediaViewerLoading";\nimport type { MessengerMedia }')
s=s.replace('  const visible = index !== null;', '''  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closing = useRef(false);
  const pagerGesture = useMemo(() => Gesture.Native(), []);
  useMediaViewerLoading(items, index, session, onEnsureLocal);
  const visible = index !== null;''')
s=s.replace('  const close = () => {','''  useEffect(() => {
    closing.current = false;
    setZoomed(false);
  }, [visible, session, index]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;''')
s=s.replace('    onClose();\n  };','    closeRef.current();\n  }, []);',1)
start=s.index('    return (\n      <View style={[styles.page, { width, height }]}>')
end=s.index('\n  return (\n    <Modal',start)
s=s[:start]+'''    const active = visible && itemIndex === index;
    return (
      <MessengerZoomableMedia width={width} height={height} resetKey={`${session}:${itemIndex}:${item.id}`}
        active={active} zoomEnabled={Boolean(localUri)} nativeChild={item.type === "video"}
        pagerGesture={items.length > 1 ? pagerGesture : undefined} onDismiss={close}
        onZoomChange={(value) => { if (active) setZoomed(value); }}>
        <View style={[styles.page, {width,height}]}>
          {localUri && item.type === "image" && (
            <Image testID={`viewer-image-${item.id}`} source={localUri} style={{width,height}} contentFit="contain" />
          )}
          {localUri && item.type === "video" && active && (
            <View style={[styles.videoStage,{top:videoTop,width,height:videoHeight}]}>
              <MessengerVideoPlayer uri={localUri} style={{width,height:videoHeight}} active={active} autoPlay fullscreenEnabled={false}
                onFallback={() => void onEnsureLocal(item).catch(() => undefined)} />
            </View>
          )}
          {!localUri && (
            <TouchableOpacity style={styles.loading} onPress={() => void onEnsureLocal(item).catch(() => undefined)}
              disabled={loading || !error} accessibilityLabel={error ? "Повторить загрузку вложения" : "Загрузка вложения"}>
              {loading || !error ? <ActivityIndicator color={colors.white} size="large" /> : (
                <><Icon name="refresh-outline" size={34} color={colors.white} /><Text style={styles.errorText}>{error}</Text></>
              )}
            </TouchableOpacity>
          )}
        </View>
      </MessengerZoomableMedia>
    );
  };
''' +s[end:]
s=s.replace('            <FlatList\n              key={`media-viewer-${session}`}', '            <GestureDetector gesture={pagerGesture}>\n            <FlatList\n              key={`media-viewer-${session}-${width}-${height}`}\n              testID="media-viewer-pager"')
s=s.replace('              scrollEnabled={!zoomed}','              scrollEnabled={!zoomed && !menuVisible}')
s=s.replace('              keyExtractor={(item) => item.id}', '              initialNumToRender={3}\n              maxToRenderPerBatch={3}\n              windowSize={3}\n              keyExtractor={(item, itemIndex) => `${itemIndex}:${item.id}`}')
s=s.replace('            />\n          ))}', '            />\n            </GestureDetector>\n          ))}',1)
s=s.replace('            accessibilityLabel="Закрыть просмотр"','            testID="media-viewer-close"\n            accessibilityLabel="Закрыть просмотр"')
p.write_text(s)
p=Path('features/messenger/MessengerAttachmentView.tsx');s=p.read_text()
start=s.index('  useEffect(() => {\n    if (viewerIndex === null) return;');end=s.index('\n\n  if (location)',start)
p.write_text(s[:start]+s[end:])
p=Path('features/messenger/MessengerProfileMediaTab.tsx');s=p.read_text()
old='''      try {
        await ensureLocal(entry.media);
      } catch {
        // The viewer keeps its retry control and the concrete error text.
      }
      setViewerSession'''
assert old in s
p.write_text(s.replace(old,'''      // Load inside the common viewer so closing is possible during download.
      setViewerSession'''))
