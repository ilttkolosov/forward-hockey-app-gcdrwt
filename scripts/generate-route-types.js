const {
  startTypescriptTypeGenerationAsync,
} = require('expo/node_modules/@expo/cli/build/src/start/server/type-generation/startTypescriptTypeGeneration');

async function generateRouteTypes() {
  await startTypescriptTypeGenerationAsync({ projectRoot: process.cwd() });

  // Expo Router debounces writing router.d.ts to combine filesystem changes.
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

generateRouteTypes().catch((error) => {
  console.error('Failed to generate Expo Router types:', error);
  process.exitCode = 1;
});
