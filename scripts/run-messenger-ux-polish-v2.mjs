import fs from "node:fs";

function replaceRequired(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Compatibility anchor not found: ${label}`);
  if (source.indexOf(needle, index + needle.length) >= 0) {
    throw new Error(`Compatibility anchor is not unique: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

// The original one-time patcher was prepared against the pre-Prettier form of
// two navigation blocks and the multiline group-avatar title. The previous CI
// run formatted those anchors but never applied the actual UX patch. Restore
// only the expected anchor spelling, then execute the already-reviewed patcher.
{
  const path = "components/PersistentBottomNavigation.tsx";
  let source = fs.readFileSync(path, "utf8");
  source = replaceRequired(
    source,
    `const isNavigationHiddenRoute = (pathname: string) =>\n  pathname.startsWith("/mobilegames/") ||\n  pathname.startsWith("/messenger/room/") ||\n  pathname === "/messenger/share" ||\n  pathname === "/messenger/search";`,
    `const isNavigationHiddenRoute = (pathname: string) => (\n  pathname.startsWith('/mobilegames/')\n  || pathname.startsWith('/messenger/room/')\n  || pathname === '/messenger/share'\n  || pathname === '/messenger/search'\n);`,
    "navigation hidden routes",
  );
  source = replaceRequired(
    source,
    `export const usePersistentBottomNavigationInset = () => {\n  const insets = useSafeAreaInsets();\n  return (\n    NAVIGATION_HEIGHT + NAVIGATION_SHADOW_EXTENT + Math.max(insets.bottom, 6)\n  );\n};`,
    `export const usePersistentBottomNavigationInset = () => {\n  const insets = useSafeAreaInsets();\n  return NAVIGATION_HEIGHT + NAVIGATION_SHADOW_EXTENT + Math.max(insets.bottom, 6);\n};`,
    "navigation inset",
  );
  fs.writeFileSync(path, source, "utf8");
}

{
  const path = "app/messenger/group/[id].tsx";
  let source = fs.readFileSync(path, "utf8");
  source = replaceRequired(
    source,
    `              <Text style={styles.localAvatarTitle}>Личный аватар группы</Text>`,
    `              <Text style={styles.localAvatarTitle}>\n                Личный аватар группы\n              </Text>`,
    "group preset title",
  );
  fs.writeFileSync(path, source, "utf8");
}

await import("./one-time-messenger-ux-polish.mjs");
