const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const guard = require("../plugins/withAndroidFirebaseGuard");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "forward-firebase-guard-"));
const validPath = path.join(tempRoot, "google-services.json");
const wrongPath = path.join(tempRoot, "google-services-wrong.json");
const invalidPath = path.join(tempRoot, "google-services-invalid.json");

try {
  fs.writeFileSync(
    validPath,
    JSON.stringify({
      client: [
        {
          client_info: {
            android_client_info: {
              package_name: guard.EXPECTED_ANDROID_PACKAGE,
            },
          },
        },
      ],
    }),
  );

  fs.writeFileSync(
    wrongPath,
    JSON.stringify({
      client: [
        {
          client_info: {
            android_client_info: {
              package_name: "com.example.wrong",
            },
          },
        },
      ],
    }),
  );

  fs.writeFileSync(invalidPath, "{not-json");

  const valid = guard.validateGoogleServicesFile(validPath);
  assert.deepEqual(valid.packageNames, [guard.EXPECTED_ANDROID_PACKAGE]);

  assert.throws(
    () => guard.validateGoogleServicesFile(path.join(tempRoot, "missing.json")),
    /was not found/,
  );
  assert.throws(
    () => guard.validateGoogleServicesFile(wrongPath),
    /does not contain package/,
  );
  assert.throws(
    () => guard.validateGoogleServicesFile(invalidPath),
    /not valid JSON/,
  );

  const gradle = guard.gradleGuardBlock();
  assert.match(gradle, /verifyForwardGoogleServicesJson/);
  assert.match(gradle, /google-services\.json/);
  assert.match(gradle, new RegExp(guard.EXPECTED_ANDROID_PACKAGE.replace(/\./g, "\\.")));

  const appConfig = fs.readFileSync(
    path.resolve(__dirname, "..", "app.config.js"),
    "utf8",
  );
  assert.match(appConfig, /withAndroidFirebaseGuard\.js/);
  assert.match(appConfig, /GOOGLE_SERVICES_JSON/);

  console.log("Android Firebase build guard checks passed.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
