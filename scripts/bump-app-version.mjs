#!/usr/bin/env node

import fs from "node:fs";

const mode = process.argv[2];
const requestedSteps = Number(process.argv[3] || "1");
if (mode !== "patch" && mode !== "minor") {
  throw new Error("Usage: node scripts/bump-app-version.mjs <patch|minor> [steps]");
}
if (!Number.isSafeInteger(requestedSteps) || requestedSteps < 1) {
  throw new Error("Version steps must be a positive integer");
}

const appConfigPath = "app.config.js";
const packagePath = "package.json";
const packageLockPath = "package-lock.json";
const appConfig = fs.readFileSync(appConfigPath, "utf8");
const versionMatch = appConfig.match(/version: "(\d+)\.(\d+)\.(\d+)"/);
const iosBuildMatch = appConfig.match(/buildNumber: "(\d+)"/);
const androidBuildMatch = appConfig.match(/versionCode: (\d+)/);
if (!versionMatch || !iosBuildMatch || !androidBuildMatch) {
  throw new Error("Cannot find app version/build fields in app.config.js");
}

const [, major, minor, patch] = versionMatch.map(Number);
const nextVersion =
  mode === "minor"
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + requestedSteps}`;
const nextBuild = Math.max(
  Number(iosBuildMatch[1]),
  Number(androidBuildMatch[1]),
) + requestedSteps;

fs.writeFileSync(
  appConfigPath,
  appConfig
    .replace(versionMatch[0], `version: "${nextVersion}"`)
    .replace(iosBuildMatch[0], `buildNumber: "${nextBuild}"`)
    .replace(androidBuildMatch[0], `versionCode: ${nextBuild}`),
);

for (const file of [packagePath, packageLockPath]) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.version = nextVersion;
  if (file === packageLockPath && json.packages?.[""]) {
    json.packages[""].version = nextVersion;
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

process.stdout.write(`${nextVersion} (${nextBuild})\n`);
