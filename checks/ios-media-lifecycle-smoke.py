"""Unsigned iOS regression with locked packages and synthetic media only.
Run identical probes before/after our native patches; never logs in to the messenger.
Requires macOS/Xcode. Results go to /tmp/ios-media-lifecycle-results.
"""
import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/ios-media-lifecycle-results')
BUNDLE = 'com.forward.media-lifecycle-regression'
PATCHES = ['expo-video+3.0.16.patch', 'react-native-svg+15.12.1.patch']
HARNESS = r'''
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { registerRootComponent } from 'expo';
import { Asset } from 'expo-asset';
import * as FS from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { createVideoPlayer } from 'expo-video';
import { requestMessengerPinVideoThumbnail as thumbnail } from './thumbnail';
import Surface from './NavigationSurface';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function App() {
  const [picture, setPicture] = useState(null);
  const [surface, setSurface] = useState(0);
  const [label, setLabel] = useState('Native media regression');
  useEffect(() => {
    let stopped = false;
    const cleanups = new Set();
    const write = async (value) => {
      setLabel(JSON.stringify(value));
      await FS.writeAsStringAsync(FS.documentDirectory + 'result.json', JSON.stringify(value));
      console.log('MEDIA_PROBE ' + JSON.stringify(value));
    };
    (async () => {
      await write({ status: 'starting' });
      // This is the actual NavigationSurface from the client, not a look-alike.
      for (let i = 1; i <= 4; i++) {
        setSurface(i);
        await delay(400);
      }
      await write({ status: 'surface-rendered', renders: 4 });
      const asset = Asset.fromModule(require('./fixture.mp4'));
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      let staleFrames = 0;
      for (let i = 0; i < 8; i++) {
        const cancel = thumbnail(uri, undefined, () => { staleFrames++; });
        cancel(); cancel();
        // Also exercise players created by the useVideoPlayer constructor path.
        const abandoned = createVideoPlayer({ uri });
        abandoned.muted = true;
        abandoned.release();
      }
      await delay(1200);
      if (staleFrames) throw new Error('Cancelled thumbnail delivered a frame');
      await write({ status: 'cancelled-loads-checked' });
      // Live source/status/playToEnd must still be delivered, not globally suppressed.
      const live = createVideoPlayer(null);
      live.muted = true;
      let sourceLoad = 0, sourceChange = 0, ready = 0, ended = 0;
      const subscriptions = [
        live.addListener('sourceLoad', (event) => { if (event.videoSource?.uri) sourceLoad++; }),
        live.addListener('sourceChange', (event) => { if (event.source?.uri) sourceChange++; }),
        live.addListener('statusChange', ({ status }) => { if (status === 'readyToPlay') { ready++; live.play(); } }),
        live.addListener('playToEnd', () => { ended++; }),
      ];
      const stopLive = () => { subscriptions.forEach(s => s.remove()); live.release(); };
      cleanups.add(stopLive);
      await live.replaceAsync({ uri });
      const deadline = Date.now() + 12000;
      while ((!sourceLoad || !sourceChange || !ready || !ended) && Date.now() < deadline) await delay(80);
      stopLive(); cleanups.delete(stopLive);
      if (!sourceLoad || !sourceChange || !ready || !ended) throw new Error('Live events missing ' + JSON.stringify({sourceLoad, sourceChange, ready, ended}));
      let frames = 0;
      for (let i = 1; i <= 4; i++) {
        await new Promise((resolve, reject) => {
          let done = false;
          const timer = setTimeout(() => reject(new Error('Thumbnail display timeout')), 12000);
          const cancel = thumbnail(uri, undefined, (frame) => {
            if (stopped) return;
            setPicture({ key: i, frame, displayed: () => {
              if (done) return;
              done = true; frames++; clearTimeout(timer); resolve();
            }});
          });
          cleanups.add(cancel);
        });
        await delay(200);
      }
      await delay(1200); // Include callbacks queued AFTER the last player release.
      cleanups.forEach(f => f()); cleanups.clear();
      await write({ status: 'passed', frames, staleFrames, surfaceRenders: 4, sourceLoad, sourceChange, ready, ended });
    })().catch(error => { void write({ status: 'failed', error: String(error) }); });
    return () => { stopped = true; cleanups.forEach(f => f()); cleanups.clear(); };
  }, []);
  return <View style={{flex:1,backgroundColor:'#eff4f9',paddingTop:70}}>
    <Text style={{padding:24}}>{label}</Text>
    {picture && <Image key={picture.key} source={picture.frame} style={{width:160,height:160,alignSelf:'center'}} onDisplay={picture.displayed} />}
    <View style={{position:'absolute',bottom:0,left:0,right:0}}><Surface key={surface} width={390} safeAreaBottom={34}/></View>
  </View>;
}
registerRootComponent(App);
'''


def run(args, cwd, name, timeout=600, check=True, env=None):
    print('RUN', name, ' '.join(map(str,args)), flush=True)
    with (OUT / (name + '.log')).open('w') as log:
        try:
            result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, text=True, timeout=timeout, env=env)
        except subprocess.TimeoutExpired:
            if check:
                raise
            log.write(f"Timed out after {timeout}s during best-effort diagnostics/cleanup\n")
            return 124
    if check and result.returncode:
        print((OUT / (name + '.log')).read_text()[-18000:], flush=True)
        raise RuntimeError(f'{name} failed: {result.returncode}')
    return result.returncode


def main():
    if sys.platform != 'darwin':
        raise RuntimeError('macOS/Xcode required')
    OUT.mkdir(exist_ok=True, parents=True)
    host = Path(tempfile.mkdtemp(prefix='forward-media-regression-'))
    spec = importlib.util.spec_from_file_location('fixture', ROOT/'checks/ios-pin-thumbnail-smoke.py')
    fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
    lock = json.loads((ROOT/'package-lock.json').read_text())['packages']
    deps = {name:lock['node_modules/'+name]['version'] for name in ['expo','expo-asset','expo-video','expo-image','expo-file-system','react','react-native','react-native-svg']}
    core = lock['node_modules/expo-modules-core']['version']
    (host/'package.json').write_text(json.dumps({'name':'media-lifecycle-regression','private':True,'version':'1.0.0','main':'index.js','dependencies':deps,'overrides':{'expo-modules-core':core}},indent=2))
    (host/'app.json').write_text(json.dumps({'expo':{'name':'MediaLifecycleRegression','slug':'media-lifecycle-regression','version':'1.0.0','newArchEnabled':True,'ios':{'bundleIdentifier':BUNDLE}}}))
    (host/'index.js').write_text(HARNESS)
    (host/'fixture.mp4').write_bytes(base64.b64decode(fixture.FIXTURE,validate=True))
    shutil.copy2(ROOT/'services/messengerPinVideoThumbnail.ts',host/'thumbnail.ts')
    navigation = (ROOT/'components/PersistentBottomNavigation.tsx').read_text()
    constants = navigation[navigation.index('const NAVIGATION_RED'):navigation.index('type NavigationSection')]
    surface = navigation[navigation.index('function NavigationSurface('):navigation.index('\nfunction UnreadBadge(')]
    (host/'NavigationSurface.tsx').write_text('import React from "react";\nimport Svg, {Defs,Filter,FeGaussianBlur,Path} from "react-native-svg";\ninterface NavigationSurfaceProps {safeAreaBottom:number;width:number}\nconst styles={navigationSurface:{}};\n'+constants+'export default '+surface)
    run(['npm','install','--ignore-scripts','--no-audit','--no-fund'],host,'npm-install')
    for name,version in {**deps,'expo-modules-core':core}.items():
        assert json.loads((host/'node_modules'/name/'package.json').read_text())['version']==version
    (OUT/'versions.json').write_text(json.dumps({**deps,'expo-modules-core':core},indent=2))
    run(['npx','expo','prebuild','--platform','ios','--no-install'],host,'prebuild')
    # Capture process stderr without simctl --console's debugger attachment.
    # This instrumentation exists only in the isolated test host.
    delegate = next((host/'ios').glob('*/AppDelegate.swift'))
    source = delegate.read_text()
    capture = r'''
    let logURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-media.log")
    freopen(logURL.path, "a", stderr)
    freopen(logURL.path, "a", stdout)
    setvbuf(stdout, nil, _IONBF, 0)
    setvbuf(stderr, nil, _IONBF, 0)
'''
    source, matches = re.subn(r'(didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{)', lambda m: m[0]+capture, source, count=1)
    assert matches == 1, 'Could not instrument isolated host stderr'
    delegate.write_text('import Darwin\n'+source)
    run(['pod','install'],host/'ios','pods',timeout=900)
    workspace = next((host/'ios').glob('*.xcworkspace')); derived=host/'build'
    devices=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','-j']))['devices']
    chosen=next((d for runtime in sorted(devices,reverse=True) if '.iOS-' in runtime for d in devices[runtime] if d['name'].startswith('iPhone')),None)
    assert chosen,'No iPhone simulator'; udid=chosen['udid']
    (OUT/'simulator.json').write_text(json.dumps(chosen,indent=2))
    outcomes={}
    for mode in ['baseline','fixed']:
        if mode=='fixed':
            for patch in PATCHES:
                run(['git','apply','--unsafe-paths',str(ROOT/'patches'/patch)],host,'apply-'+patch)
        run(['xcodebuild','-workspace',str(workspace),'-scheme',workspace.stem,'-configuration','Release','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',str(derived),'CODE_SIGNING_ALLOWED=NO','ONLY_ACTIVE_ARCH=YES','ARCHS='+os.uname().machine,'build'],host,'xcodebuild-'+mode,timeout=1500)
        if mode == 'baseline':
            if chosen['state'] != 'Booted': run(['xcrun','simctl','boot',udid],host,'boot')
            run(['xcrun','simctl','bootstatus',udid,'-b'],host,'bootstatus',timeout=300)
        app=next((derived/'Build/Products/Release-iphonesimulator').glob('*.app'))
        run(['xcrun','simctl','install',udid,str(app)],host,'install-'+mode)
        data=Path(subprocess.check_output(['xcrun','simctl','get_app_container',udid,BUNDLE,'data'],text=True).strip())
        documents=data/'Documents';documents.mkdir(exist_ok=True)
        result=documents/'result.json';result.unlink(missing_ok=True)
        env=dict(os.environ,SIMCTL_CHILD_CG_CONTEXT_SHOW_BACKTRACE='1',SIMCTL_CHILD_CGBITMAP_CONTEXT_LOG_ERRORS='1')
        native_log = documents/'native-media.log'; native_log.unlink(missing_ok=True)
        run(['xcrun','simctl','launch',udid,BUNDLE],host,'launch-'+mode,timeout=120,env=env)
        deadline=time.monotonic()+100;value={}
        while time.monotonic()<deadline:
            try:value=json.loads(result.read_text())
            except (OSError,ValueError):pass
            if value.get('status') in ['passed','failed']:break
            time.sleep(.5)
        time.sleep(2)
        if native_log.exists(): shutil.copy2(native_log,OUT/('runtime-'+mode+'.log'))
        else: (OUT/('runtime-'+mode+'.log')).write_text('Host did not create its native log')
        run(['xcrun','simctl','io',udid,'screenshot',str(OUT/(mode+'.png'))],host,'screenshot-'+mode,timeout=60,check=False)
        run(['xcrun','simctl','spawn',udid,'log','show','--last','2m','--style','compact','--predicate','process == "MediaLifecycleRegression"'],host,'system-'+mode,timeout=60,check=False)
        run(['xcrun','simctl','terminate',udid,BUNDLE],host,'terminate-'+mode,timeout=60,check=False)
        outcomes[mode]=value
        text=(OUT/('runtime-'+mode+'.log')).read_text(errors='replace') + (OUT/('system-'+mode+'.log')).read_text(errors='replace')
        outcomes[mode]['orphanEvents']=len(re.findall('JS object is no longer associated',text))
        outcomes[mode]['bitmapErrors']=len(re.findall("Unsupported image format 'UNKNOWN'|CGBitmapContextCreate: unsupported|CGDisplayListDrawInContext: invalid|CGBitmapContextCreateImage: invalid",text))
        (OUT/(mode+'-result.json')).write_text(json.dumps(outcomes[mode],indent=2))
    summary={'outcomes':outcomes,'passed':outcomes['fixed'].get('status')=='passed' and outcomes['fixed']['orphanEvents']==0 and outcomes['fixed']['bitmapErrors']==0}
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary,indent=2),flush=True)
    assert outcomes['baseline'].get('status')=='passed','Baseline probe did not complete'
    assert summary['passed'],'Fixed probe failed or retained media warnings'


if __name__=='__main__':main()
