"""Isolated, unsigned iOS simulator reproduction. No messenger login or production data.
Builds a tiny host with the exact Expo/RN versions from this repository's lockfile.
Runs the previous scalar helper and the corrected helper in the SAME native binary.
The fixed path must generate and render four native image refs after player release.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/ios-pin-thumbnail-native-results')
BASE = 'edc8ac4f6427f340a826a2c96ad9b1a7769d096e'
BUNDLE = 'com.forward.pin-thumbnail-regression'
# Synthetic 64x64, 0.4-second H.264 fixture, generated with ffmpeg (no user content).
FIXTURE = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMxbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAZAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlx0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAGQAAAAAAABAAAAAAHUbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAEABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABf21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT9zdGJsAAAAv3N0c2QAAAAAAAAAAQAAAK9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANWF2Y0MBZAAK/+EAGGdkAAqs2UQmwEQAAAMABAAAAwAoPEiWWAEABmjr48siwP34+AAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAA50AAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAgAACAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAAtYAAAAOAAAAFHN0Y28AAAAAAAAAAQAAA2EAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjcuMTAzAAAACGZyZWUAAALsbWRhdAAAAq0GBf//qdxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0yIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj01IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAIWWIhAAQ//73gb8yy2Q/qslx+ed8UPyh0qwairOl4CszsQAAAApBmiFsQ//+qZ00'
HARNESS = r'''
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { registerRootComponent } from 'expo';
import { Asset } from 'expo-asset';
import * as FS from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { requestMessengerPinVideoThumbnail as fixed } from './fixed-helper';
import { requestMessengerPinVideoThumbnail as baseline } from './baseline-helper';
function App() {
  const [picture, setPicture] = useState(null);
  const [label, setLabel] = useState('Starting native pin thumbnail test');
  useEffect(() => {
    let stopped = false, cleanup, timer;
    const write = async (data) => {
      setLabel(JSON.stringify(data));
      await FS.writeAsStringAsync(FS.documentDirectory + 'result.json', JSON.stringify(data));
    };
    (async () => {
      const mode = (await FS.readAsStringAsync(FS.documentDirectory + 'mode.txt')).trim();
      await write({ mode, status: 'loading-fixture' });
      const asset = Asset.fromModule(require('./fixture.mp4'));
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      const request = mode === 'baseline' ? baseline : fixed;
      async function generate(index) {
        if (stopped) return;
        await write({ mode, status: 'requesting-frame', index });
        let loaded = false;
        // Native SharedRef images are already decoded: onDisplay, not network onLoad.
      cleanup = request(uri, undefined, (frame) => {
          if (stopped) return;
          setPicture({ key: index, frame, onDisplay: async () => {
            if (loaded || stopped) return;
            loaded = true;
            await write({ mode, status: 'rendered-frame', index, width: frame.width, height: frame.height });
            if (index < 4) {
              timer = setTimeout(() => { void generate(index + 1); }, 150);
            } else {
              await write({ mode, status: 'passed', frames: index, width: frame.width, height: frame.height });
            }
          } });
        });
      }
      await generate(1);
    })().catch((error) => { void write({ status: 'js-error', message: String(error) }); });
    return () => { stopped = true; clearTimeout(timer); cleanup?.(); };
  }, []);
  return <View style={{ flex: 1, padding: 50, justifyContent: 'center' }}>
    <Text>{label}</Text>
    {picture && <Image key={picture.key} source={picture.frame} style={{ width: 160, height: 160 }}
      onDisplay={picture.onDisplay} onError={(error) => setLabel('Native image error: ' + JSON.stringify(error))} />}
  </View>;
}
registerRootComponent(App);
'''


def run(args, cwd, name, timeout=600, check=True):
    print('RUN', name, ' '.join(map(str, args)), flush=True)
    with (OUT / (name + '.log')).open('w') as log:
        result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, text=True, timeout=timeout)
    if check and result.returncode:
        print((OUT / (name + '.log')).read_text()[-16000:], flush=True)
        raise RuntimeError(f'{name} failed ({result.returncode})')
    return result.returncode


def main():
    if sys.platform != 'darwin':
        raise RuntimeError('This test requires macOS / Xcode with an iOS simulator')
    OUT.mkdir(parents=True, exist_ok=True)
    host = Path(tempfile.mkdtemp(prefix='forward-pin-native-'))
    lock = json.loads((ROOT / 'package-lock.json').read_text())['packages']
    deps = {name: lock['node_modules/' + name]['version'] for name in
            ['expo', 'expo-asset', 'expo-video', 'expo-image', 'expo-file-system', 'react', 'react-native']}
    core = lock['node_modules/expo-modules-core']['version']
    (host / 'package.json').write_text(json.dumps({
        'name': 'pin-thumbnail-regression', 'version': '1.0.0', 'private': True,
        'main': 'index.js', 'dependencies': deps, 'overrides': {'expo-modules-core': core},
    }, indent=2))
    (host / 'app.json').write_text(json.dumps({'expo': {
        'name': 'PinThumbnailRegression', 'slug': 'pin-thumbnail-regression', 'version': '1.0.0',
        'newArchEnabled': True, 'ios': {'bundleIdentifier': BUNDLE, 'supportsTablet': False},
    }}))
    (host / 'index.js').write_text(HARNESS)
    (host / 'fixture.mp4').write_bytes(base64.b64decode(FIXTURE, validate=True))
    source = (ROOT / 'services/messengerPinVideoThumbnail.ts').read_bytes()
    (host / 'fixed-helper.ts').write_bytes(source)
    old = subprocess.check_output(['git', 'show', BASE + ':services/messengerPinVideoThumbnail.ts'], cwd=ROOT)
    assert b'generateThumbnailsAsync(0,' in old and b'generateThumbnailsAsync([0],' in source
    (host / 'baseline-helper.ts').write_bytes(old)
    (OUT / 'versions.json').write_text(json.dumps({
        'dependencies': deps, 'expo-modules-core': core,
        'baseline_ref': BASE, 'fixed_helper_sha256': hashlib.sha256(source).hexdigest(),
        'xcode': subprocess.check_output(['xcodebuild', '-version'], text=True),
    }, indent=2))
    run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund'], host, 'npm-install')
    installed_core = json.loads((host / 'node_modules/expo-modules-core/package.json').read_text())['version']
    assert installed_core == core, (installed_core, core)
    for name, version in deps.items():
        assert json.loads((host / 'node_modules' / name / 'package.json').read_text())['version'] == version
    run(['npx', 'expo', 'prebuild', '--platform', 'ios', '--no-install'], host, 'prebuild')
    run(['pod', 'install'], host / 'ios', 'pods', timeout=900)
    workspace = next((host / 'ios').glob('*.xcworkspace'))
    scheme = workspace.stem
    derived = host / 'build'
    run(['xcodebuild', '-workspace', str(workspace), '-scheme', scheme,
         '-configuration', 'Release', '-sdk', 'iphonesimulator',
         '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', str(derived),
         'CODE_SIGNING_ALLOWED=NO', 'ONLY_ACTIVE_ARCH=YES', 'ARCHS=' + os.uname().machine, 'build'],
        host, 'xcodebuild', timeout=1500)
    apps = list((derived / 'Build/Products/Release-iphonesimulator').glob('*.app'))
    assert apps, 'Missing unsigned simulator app'
    devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '-j']))['devices']
    selected = next((d for runtime in sorted(devices, reverse=True) if '.iOS-' in runtime
                     for d in devices[runtime] if d['name'].startswith('iPhone')), None)
    assert selected, 'No installed iPhone simulator'
    udid = selected['udid']
    (OUT / 'simulator.json').write_text(json.dumps(selected, indent=2))
    if selected['state'] != 'Booted':
        run(['xcrun', 'simctl', 'boot', udid], host, 'boot')
    run(['xcrun', 'simctl', 'bootstatus', udid, '-b'], host, 'bootstatus', timeout=300)
    run(['xcrun', 'simctl', 'install', udid, str(apps[0])], host, 'install')
    data = Path(subprocess.check_output(['xcrun', 'simctl', 'get_app_container', udid, BUNDLE, 'data'], text=True).strip())
    documents = data / 'Documents'
    documents.mkdir(exist_ok=True)
    outcomes = {}
    for mode, seconds in [('baseline', 25), ('fixed', 70)]:
        if mode != 'baseline':
            run(['xcrun', 'simctl', 'terminate', udid, BUNDLE], host, 'terminate-' + mode, timeout=60, check=False)
        (documents / 'mode.txt').write_text(mode)
        result = documents / 'result.json'
        result.unlink(missing_ok=True)
        run(['xcrun', 'simctl', 'launch', udid, BUNDLE], host, 'launch-' + mode)
        deadline = time.monotonic() + seconds
        value = {}
        while time.monotonic() < deadline:
            try:
                value = json.loads(result.read_text())
            except (OSError, ValueError):
                pass
            if value.get('status') in ('passed', 'js-error'):
                break
            time.sleep(0.5)
        outcomes[mode] = value
        (OUT / (mode + '-result.json')).write_text(json.dumps(value, indent=2))
        run(['xcrun', 'simctl', 'io', udid, 'screenshot', str(OUT / (mode + '.png'))], host, 'screenshot-' + mode, check=False)
        run(['xcrun', 'simctl', 'spawn', udid, 'log', 'show', '--last', '2m', '--style', 'compact',
             '--predicate', 'process == "PinThumbnailRegression"'], host, 'runtime-' + mode, check=False)
        for report in (Path.home() / 'Library/Logs/DiagnosticReports').glob('PinThumbnailRegression*'):
            if report.is_file(): shutil.copy2(report, OUT / report.name)
    assert outcomes['baseline'].get('status') == 'requesting-frame', 'Expected old helper to stop at native thumbnail call: ' + str(outcomes)
    assert outcomes['fixed'].get('status') == 'passed' and outcomes['fixed'].get('frames') == 4, str(outcomes)
    (OUT / 'summary.json').write_text(json.dumps({'passed': True, 'outcomes': outcomes}, indent=2))
    print('Native simulator: baseline stopped at scalar thumbnail call; fixed array generated and rendered four frames.', flush=True)


if __name__ == '__main__':
    main()
