try {
  // Background PUSH handling is useful, but it is not a prerequisite for
  // opening the foreground app. Some vendor Android builds can fail while an
  // optional native notifications/task module is being initialized. Keep that
  // failure outside the critical launch path so the router can still mount.
  // CommonJS is intentional here: import-time native failures must be caught
  // synchronously before the router entry point is loaded.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./services/messengerPushTask');
} catch (error) {
  console.warn(
    '[Startup] Background PUSH bootstrap skipped:',
    error instanceof Error ? error.message : String(error),
  );
}

// Keep the router entry load ordered after the guarded optional bootstrap.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
