import assert from 'node:assert/strict';
import { compareAppVersions, getUpdateRequirement, getUpdateUrl } from '../services/startupConfigPolicy.ts';

const config = {
  teams_version: 1, players_version: 1, league_id: 0, season_id: 0,
  tournamentsNow: [], tournamentsPast: [],
  app: {
    latest_version: { ios: '2.4.0', android: '2.4.0' },
    minimum_supported_version: { ios: '2.2.0', android: '2.1.0' },
    app_store_url: 'https://apps.apple.com/app/id123',
    google_play_url: 'https://play.google.com/store/apps/details?id=test',
    android_download_url: 'https://example.test/app.apk',
  },
};

assert.equal(compareAppVersions('2.4', '2.4.0'), 0);
assert.equal(compareAppVersions('2.4.1+136', '2.4.0'), 1);
assert.equal(compareAppVersions('2.3.9', '2.4.0'), -1);
assert.equal(getUpdateRequirement(config, 'ios', '2.4.0'), 'none');
assert.equal(getUpdateRequirement(config, 'ios', '2.3.0'), 'optional');
assert.equal(getUpdateRequirement(config, 'ios', '2.1.9'), 'required');
assert.equal(getUpdateUrl(config, 'ios'), config.app.app_store_url);
assert.equal(getUpdateUrl(config, 'android'), config.app.android_download_url);

const playFallback = structuredClone(config);
playFallback.app.android_download_url = '';
assert.equal(getUpdateUrl(playFallback, 'android'), config.app.google_play_url);

console.log('Startup config policy checks passed.');
