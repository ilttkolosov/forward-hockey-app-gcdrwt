try {
  // Background PUSH handling is useful, but it is not a prerequisite for
  // opening the foreground app. Some vendor Android builds can fail while an
  // optional native notifications/task module is being initialized. Keep that
  // failure outside the critical launch path so the router can still mount.
  require('./services/messengerPushTask');
} catch (error) {
  console.warn(
    '[Startup] Background PUSH bootstrap skipped:',
    error instanceof Error ? error.message : String(error),
  );
}

require('expo-router/entry');
