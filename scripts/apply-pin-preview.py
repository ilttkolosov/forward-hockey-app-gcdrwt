from pathlib import Path

def replace(path, before, after, count=1):
    p = Path(path)
    text = p.read_text()
    assert text.count(before) == count, (path, before[:80], text.count(before))
    p.write_text(text.replace(before, after))

replace('features/messenger/PinnedMessagesBanner.tsx', '  visitedId,\n', '')
replace('features/messenger/PinnedMessagesBanner.tsx', '''  const activeId = items.some((item) => item.message.id === visitedId)
    ? visitedId
    : messageId;''', '''  // The rail describes the preview (the next tap target), never the focused row.
  const activeId = messageId;''')
replace('features/messenger/pins.ts', '  return items.length ? items[(index + 1) % items.length]!.message.id : null;', '''  if (!items.length) return null;
  // The fixed rail is oldest -> newest; tapping walks newest -> oldest and wraps.
  return items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length]!.message.id;''')
replace('checks/messenger-pins.mjs', 'assert.equal(nextMessengerPinId(pins, "b"), "c");', 'assert.equal(nextMessengerPinId(pins, "b"), "a");')
replace('checks/messenger-pins.mjs', 'assert.equal(nextMessengerPinId(pins, "c"), "a");', '''assert.equal(nextMessengerPinId(pins, "c"), "b");
assert.equal(nextMessengerPinId(pins, "a"), "c");
assert.equal(nextMessengerPinId(pins, "missing"), "b");''')
replace('checks/messenger-pins.mjs', 'assert.equal(currentMessengerPinId(chronological, null), "newest");', '''assert.equal(currentMessengerPinId(chronological, null), "newest");
let selected = currentMessengerPinId(chronological, null);
for (const expected of ["middle", "older", "newest", "middle", "older", "newest"]) {
  selected = nextMessengerPinId(chronological, selected);
  assert.equal(selected, expected, "preview cycles backward through message dates");
}''')
replace('checks/messenger-pin-presentation.cjs', '''  assert.equal(latest.currentId, "1");
  assert.equal(latest.visitedId, "3");
  await act(async () => {
    latest.visit("1");
  });
  assert.equal(latest.currentId, "2");''', '''  assert.equal(latest.currentId, "2");
  assert.equal(latest.visitedId, "3");
  await act(async () => {
    latest.visit("2");
  });
  assert.equal(latest.currentId, "1");
  await act(async () => {
    latest.visit("1");
  });
  assert.equal(latest.currentId, "3", "oldest wraps back to newest");''')
replace('docs/CHAT_PINNING.md', 'последнего — к первому. Утолщённый сегмент отмечает посещённое закрепление.', 'самого старого — к самому новому. Перелистывание идёт от новых к старым.\nУтолщённый сегмент всегда отмечает превью в полоске, а не сообщение в ленте.\nДля трёх закреплений по возрастанию created_at: вход — превью №3 и нижний\nсегмент; тап — фокус №3, превью №2 и средний сегмент; затем фокус №2,\nпревью №1 и верхний сегмент; затем фокус №1, превью №3 и нижний сегмент.\nДо подтверждения перехода, при ошибке или отмене превью/сегмент не меняются.')
replace('docs/CHAT_PINNING.md', 'После последнего сообщения цикл переходит к первому.', 'После самого старого сообщения цикл переходит к самому новому.')
replace('checks/messenger-pin-presentation.cjs', '''  console.log(
    "Pin presentation runtime:''', '''  // Actual hook and banner: the focused row must never override the next preview.
  const previewPins = pins.map((pin) => ({
    ...pin,
    message: { ...pin.message, text: `Превью ${pin.message.id}` },
  }));
  let selection;
  function PreviewHarness({ items = previewPins, identity = "user:preview", active = true }) {
    selection = usePinnedMessageSelection(items, identity, active);
    return React.createElement(Banner, {
      items,
      messageId: selection.currentId,
      visitedId: selection.visitedId,
      busy: false,
      active,
      accessToken: "fixture",
      onPress() {},
    });
  }
  await act(async () => { tree = create(React.createElement(PreviewHarness)); });
  const segments = () => tree.root.findAll((node) =>
    typeof node.props.testID === "string" && node.props.testID.startsWith("pin-segment-"));
  const originalSegments = segments();
  function checkPreview(expected, focused) {
    assert.equal(selection.currentId, expected);
    assert.equal(selection.visitedId, focused);
    assert.deepEqual(tree.root.findAllByType("Text").map((node) => node.children.join("")),
      ["Закрепленное сообщение", `Превью ${expected}`]);
    const current = segments();
    assert.deepEqual(current.map((node) => node.props.testID),
      ["pin-segment-1", "pin-segment-2", "pin-segment-3"]);
    current.forEach((node, index) => {
      assert.equal(node, originalSegments[index], "fixed section identity survives cycling");
      const style = Object.assign({}, ...node.props.style);
      assert.equal(style.width, String(index + 1) === expected ? 4 : 2,
        "bold segment belongs to the preview, not the focused row");
    });
  }
  checkPreview("3", null);
  for (const [focused, preview] of [["3", "2"], ["2", "1"], ["1", "3"],
    ["3", "2"], ["2", "1"], ["1", "3"]]) {
    await act(async () => { selection.visit(focused); });
    checkPreview(preview, focused);
  }
  await act(async () => { selection.resetToLatest(); });
  checkPreview("3", null);
  await act(async () => { tree.update(React.createElement(PreviewHarness, { items: [previewPins[0]] })); });
  await act(async () => { selection.visit("1"); });
  assert.equal(selection.currentId, "1", "one pin cycles to itself");
  assert.equal(segments().length, 1);
  assert.equal(Object.assign({}, ...segments()[0].props.style).width, 4);
  await act(async () => { tree.update(React.createElement(PreviewHarness, { items: [] })); });
  assert.equal(tree.toJSON(), null, "empty pins have no banner or rail");
  await act(async () => { tree.unmount(); });
  console.log(
    "Pin presentation runtime:''')
