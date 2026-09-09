/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
// Exercise the production room callbacks; native measurements, SQLite and network are mocked.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { stripTypeScriptTypes } = require("node:module");
const vm = require("node:vm");
const source = readFileSync(
  resolve(__dirname, "../app/messenger/room/[id].tsx"),
  "utf8",
);
const callbackSource = source.slice(
  source.indexOf("  const cancelMessageNavigation ="),
  source.indexOf(
    "\n  useEffect(() => {",
    source.indexOf("  const navigateToRepliedMessage ="),
  ),
);
const retrySource = source.slice(
  source.indexOf("  const handleScrollToIndexFailed ="),
  source.indexOf("  const loadFilteredAuthorMessages ="),
);
assert(
  callbackSource.includes("measureMessengerFocus"),
  "test must execute the real measurement path",
);
assert(
  !callbackSource.includes("setSyncError("),
  "navigation must neither set nor clear synchronization failures",
);
assert(
  source.includes("data={visibleMessages}") &&
    source.includes("renderedMessagesRef.current = visibleMessages"),
  "scroll indices must follow rendered rows",
);
assert(
  source.includes("!messageNavigationId ? { minIndexForVisible: 0 }"),
  "native anchoring must not undo a deliberate navigation",
);
assert(
  source.includes("navigationError &&"),
  "a navigation-specific notice must be rendered",
);
const ref = (current) => ({ current });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

(async () => {
  const core = await import(
    pathToFileURL(resolve(__dirname, "../features/messenger/messageFocus.ts"))
      .href
  );
  function harness(options = {}) {
    const message = {
      id: "target",
      sequence: "42",
      room_id: "room",
      kind: "text",
      text: "private text not for diagnostics",
    };
    const state = {
      syncError: "existing sync failure",
      navigationError: "old navigation failure",
      highlighted: null,
      positionCalls: [],
      log: [],
      offsetCalls: 0,
    };
    const rect = { x: 10, y: 1800, width: 290, height: 60 };
    const view = (r) => ({
      measureInWindow: (cb) => cb(r.x, r.y, r.width, r.height),
    });
    const timers = new Set();
    const scope = {
      ...core,
      console,
      Date,
      Error,
      Promise,
      Math,
      setTimeout: (callback, ms) => {
        const t = setTimeout(callback, ms);
        timers.add(t);
        return t;
      },
      clearTimeout,
      requestAnimationFrame: (callback) => setTimeout(callback, 0),
      useCallback: (callback) => callback,
      waitForMessengerFocus: (args) =>
        core.waitForMessengerFocus({
          ...args,
          timeoutMs: 160,
          intervalMs: 3,
          retryMs: 12,
          stableMs: 9,
        }),
      messageNavigationGeneration: ref(0),
      messageNavigationTarget: ref(null),
      messageNavigationTimer: ref(null),
      messageNavigationRetryTimer: ref(null),
      renderedNavigationId: ref(null),
      renderedListReady: ref(true),
      renderedMessagesRef: ref([message]),
      messagesRef: ref([
        { id: "hidden-deleted", deleted_at: "today" },
        message,
      ]),
      focusVisibleServerMessageIds: ref([]),
      focusViewabilityUpdatedAt: ref(0),
      feedViewportRef: ref(view({ x: 0, y: 100, width: 320, height: 600 })),
      navigationViewRef: ref(view(rect)),
      pinIdentityRef: ref("user:room"),
      reactionMutationIds: ref(new Set()),
      roomId: "room",
      Platform: { OS: "android" },
      db: {},
      router: { push() {} },
      setMessageNavigationId: (id) => {
        scope.renderedNavigationId.current = id;
      },
      setNavigationError: (error) => {
        state.navigationError = error;
      },
      setSyncError: (error) => {
        state.syncError = error;
      },
      setHighlightedMessageId: (id) => {
        state.highlighted = id;
      },
      beginManualFeedNavigation() {},
      positionInitialMessages() {},
      pendingInitialPosition: ref(false),
      initialPositionAttempts: ref(0),
      initialPositionRetryTimer: ref(null),
      messengerLog: (level, event, context) =>
        state.log.push({ level, event, context }),
      messengerErrorMessage: (_error, fallback) => fallback,
      loadCachedMessengerMessageContext: async () => [],
      getMessengerMessage: async () => message,
      getMessengerMessages: async () => ({ items: [] }),
      cacheMessengerMessages: async () => {},
      incrementMessengerSequence: (n) => String(BigInt(n) + 1n),
      mergeMessengerMessages: (left, right) => [
        ...new Map([...left, ...right].map((m) => [m.id, m])).values(),
      ],
      setMessages: (updater) => {
        scope.messagesRef.current = updater(scope.messagesRef.current);
      },
      listRef: ref({
        scrollToIndex: (request) => {
          state.positionCalls.push(request);
          if (options.throwOnce && state.positionCalls.length === 1)
            throw new Error("native layout not ready");
          if (!options.stuck) rect.y = options.tall ? 110 : 350;
          if (options.tall) rect.height = 1100;
        },
        scrollToOffset: () => {
          state.offsetCalls += 1;
        },
        recordInteraction() {},
      }),
    };
    const context = vm.createContext(scope);
    new vm.Script(
      stripTypeScriptTypes(
        callbackSource +
          retrySource +
          "\nglobalThis.handlers = { cancelMessageNavigation, positionMessageNavigationTarget, navigateToRepliedMessage, handleScrollToIndexFailed };",
      ),
    ).runInContext(context);
    return {
      scope,
      state,
      rect,
      message,
      ...scope.handlers,
      dispose: () => {
        scope.handlers.cancelMessageNavigation();
        timers.forEach(clearTimeout);
      },
    };
  }

  // No onViewableItemsChanged event at all: measure the already rendered native row.
  const normal = harness();
  assert.equal(await normal.navigateToRepliedMessage(normal.message), true);
  assert.equal(
    normal.state.positionCalls[0].index,
    0,
    "hidden/deleted cache row must not shift the rendered index",
  );
  assert.equal(normal.state.highlighted, "target");
  assert.equal(normal.state.navigationError, null);
  assert.equal(
    normal.state.syncError,
    "existing sync failure",
    "success must not erase a real synchronization error",
  );
  assert.deepEqual(
    normal.scope.focusVisibleServerMessageIds.current,
    [],
    "no viewability event needed",
  );
  normal.dispose();

  const retry = harness({ throwOnce: true });
  assert.equal(
    await retry.navigateToRepliedMessage(retry.message),
    true,
    "retry a transient native scroll exception",
  );
  assert(retry.state.positionCalls.length >= 2);
  retry.dispose();

  const tall = harness({ tall: true });
  assert.equal(
    await tall.navigateToRepliedMessage(tall.message),
    true,
    "large media row can be focused without fully fitting",
  );
  tall.dispose();

  const stuck = harness({ stuck: true });
  // Stale viewability even claims the target is visible: real off-screen geometry must win.
  stuck.scope.focusVisibleServerMessageIds.current = ["target"];
  stuck.scope.focusViewabilityUpdatedAt.current = Date.now() + 100000;
  assert.equal(await stuck.navigateToRepliedMessage(stuck.message), false);
  assert.equal(stuck.state.syncError, "existing sync failure");
  assert.match(stuck.state.navigationError, /Не удалось перейти/);
  assert.equal(stuck.state.highlighted, null);
  const diagnostic = stuck.state.log.find(
    (entry) => entry.event === "message.navigation.focus_timeout",
  );
  assert(diagnostic && diagnostic.context.platform === "android");
  assert.equal(diagnostic.context.measured_visible, false);
  assert(diagnostic.context.position_requests > 1);
  assert(
    !JSON.stringify(stuck.state.log).includes("private text"),
    "diagnostics never include message contents",
  );
  // A successful retry clears only the navigation notice.
  stuck.rect.y = 350;
  assert.equal(await stuck.navigateToRepliedMessage(stuck.message), true);
  assert.equal(stuck.state.navigationError, null);
  assert.equal(stuck.state.syncError, "existing sync failure");
  stuck.dispose();

  const failure = harness();
  failure.scope.loadCachedMessengerMessageContext = async () => {
    throw new Error("database unavailable");
  };
  assert.equal(await failure.navigateToRepliedMessage(failure.message), false);
  assert.match(failure.state.navigationError, /Не удалось открыть/);
  assert.equal(failure.state.syncError, "existing sync failure");
  failure.dispose();

  const cancelled = harness({ stuck: true });
  const pending = cancelled.navigateToRepliedMessage(cancelled.message);
  await sleep(8);
  cancelled.cancelMessageNavigation();
  assert.equal(
    await pending,
    false,
    "manual drag/room exit cancels pending focus",
  );
  assert.equal(
    cancelled.state.navigationError,
    null,
    "cancellation is not an error",
  );
  const calls = cancelled.state.positionCalls.length;
  await sleep(30);
  assert.equal(
    cancelled.state.positionCalls.length,
    calls,
    "no stale retry after cancellation",
  );
  cancelled.dispose();

  const stale = harness();
  let resolveCache;
  stale.scope.loadCachedMessengerMessageContext = () =>
    new Promise((resolve) => {
      resolveCache = resolve;
    });
  const old = stale.navigateToRepliedMessage(stale.message);
  stale.scope.pinIdentityRef.current = "other-user:other-room";
  resolveCache([]);
  assert.equal(await old, false);
  assert.equal(stale.state.positionCalls.length, 0);
  stale.dispose();

  const delayed = harness();
  assert.equal(await delayed.navigateToRepliedMessage(delayed.message), true);
  delayed.handleScrollToIndexFailed({
    index: 0,
    averageItemLength: 72,
    highestMeasuredFrameIndex: 0,
  });
  delayed.cancelMessageNavigation();
  const count = delayed.state.positionCalls.length;
  await sleep(180);
  assert.equal(
    delayed.state.positionCalls.length,
    count,
    "the FlatList fallback timer cannot revive a cancelled target",
  );
  delayed.dispose();

  console.log(
    "Production room navigation: missing viewability, real geometry, rendered index, retries, timeout diagnostics, independent sync status and cancellation passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
