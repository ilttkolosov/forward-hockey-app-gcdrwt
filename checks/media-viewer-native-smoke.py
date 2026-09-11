"""Synthetic native viewer regression; real gestures and profile tab, no production data."""
import argparse, base64, importlib.util, json, os, shutil, struct, subprocess, tempfile, zlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/media-viewer-native-results')
BUNDLE = 'com.forward.media.viewer.regression'
APP = r'''
import React,{useState,useCallback} from 'react';
import {View,Text,Pressable,ScrollView} from 'react-native';
import {registerRootComponent} from 'expo';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import Viewer from './features/messenger/MessengerMediaViewer';
import ProfileMedia from './features/messenger/MessengerProfileMediaTab';
import {items,cacheMessengerMedia} from './services/messengerMediaCache';
function App(){
 const [profile,setProfile]=useState(false),[index,setIndex]=useState(null),[session,setSession]=useState(0);
 const [uris,setUris]=useState({}),[loading,setLoading]=useState(new Set()),[errors,setErrors]=useState({});
 const ensure=useCallback(async(item)=>{
   setLoading(x=>new Set(x).add(item.id));
   try{const uri=await cacheMessengerMedia(item);setUris(x=>({...x,[item.id]:uri}));return uri;}
   catch(e){setErrors(x=>({...x,[item.id]:String(e)}));throw e;}
   finally{setLoading(x=>{const n=new Set(x);n.delete(item.id);return n;});}
 },[]);
 return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider>
  <ScrollView style={{flex:1,padding:25,paddingTop:80}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Open photos" onPress={()=>{setSession(s=>s+1);setIndex(0);}} style={{padding:15}}><Text>Open photos</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Open profile media" onPress={()=>setProfile(true)} style={{padding:15}}><Text>Open profile media</Text></Pressable>
   {profile&&<ProfileMedia roomId="synthetic-room" accessToken="synthetic-token" onShowInChat={()=>{}} onForward={()=>{}}/>}
  </ScrollView>
  <Viewer items={items} index={index} session={session} localUris={uris} loadingIds={loading} errors={errors} savingId={null}
    onIndexChange={setIndex} onClose={()=>setIndex(null)} onEnsureLocal={ensure} onSave={async()=>{}}/>
 </SafeAreaProvider></GestureHandlerRootView>;
}
registerRootComponent(App);
'''
CACHE = r'''
import {Asset} from 'expo-asset';
import * as FS from 'expo-file-system/legacy';
const fixtures=[require('../photo1.png'),require('../photo2.png'),require('../fixture.mp4'),require('../photo4.png'),require('../photo5.png')];
export const items=fixtures.map((x,i)=>({id:'fixture-'+i,type:i===2?'video':'image',mime_type:i===2?'video/mp4':'image/png',original_name:'media-'+(i+1)+(i===2?'.mp4':'.png'),url:'fixture:'+i,width:160,height:160,size_bytes:1000}));
const pending=new Map();
export async function cacheMessengerMedia(item){
 if(pending.has(item.id))return pending.get(item.id);
 const request=(async()=>{await new Promise(r=>setTimeout(r,700));const a=Asset.fromModule(fixtures[items.findIndex(x=>x.id===item.id)]);await a.downloadAsync();return a.localUri||a.uri;})();
 pending.set(item.id,request);return request;
}
export function getCachedMessengerMediaUri(){return Promise.resolve(null);}
export function messengerMediaCachePath(){return FS.cacheDirectory;}
'''
FLOW = '''appId: com.forward.media.viewer.regression
---
- launchApp
- tapOn: Open photos
- extendedWaitUntil:
    visible: "1 из 5"
    timeout: 20000
- swipe:
    start: 80%, 50%
    end: 20%, 50%
    duration: 500
- extendedWaitUntil:
    visible: "2 из 5"
    timeout: 5000
- extendedWaitUntil:
    visible:
      id: viewer-image-fixture-1
    timeout: 15000
- takeScreenshot: photo-next
- doubleTapOn:
    point: 50%, 50%
- swipe:
    start: 50%, 40%
    end: 50%, 85%
    duration: 700
- assertVisible: "2 из 5"
- doubleTapOn:
    point: 50%, 50%
- swipe:
    start: 50%, 45%
    end: 50%, 50%
    duration: 800
- assertVisible: "2 из 5"
- swipe:
    start: 50%, 40%
    end: 50%, 85%
    duration: 700
- assertVisible: Open photos
- assertNotVisible: "2 из 5"
- tapOn: Open profile media
- extendedWaitUntil:
    visible: "Вложение media-2.png"
    timeout: 20000
- tapOn: "Вложение media-2.png"
- assertVisible: "2 из 5"
- swipe:
    start: 80%, 50%
    end: 20%, 50%
    duration: 500
- extendedWaitUntil:
    visible: "3 из 5"
    timeout: 5000
- extendedWaitUntil:
    visible:
      id: viewer-video-fixture-2
    timeout: 15000
- assertNotVisible: "Нажмите, чтобы загрузить"
- takeScreenshot: profile-video
- swipe:
    start: 80%, 40%
    end: 20%, 40%
    duration: 500
- extendedWaitUntil:
    visible: "4 из 5"
    timeout: 5000
- extendedWaitUntil:
    visible:
      id: viewer-image-fixture-3
    timeout: 15000
- takeScreenshot: profile-photo-next
- swipe:
    start: 50%, 40%
    end: 50%, 85%
    duration: 700
- assertVisible: "Вложение media-2.png"
- assertNotVisible: "4 из 5"
- tapOn: "Вложение media-2.png"
- assertVisible: "2 из 5"
- tapOn:
    id: media-viewer-close
- assertVisible: "Вложение media-2.png"
'''
def run(args,cwd,name,timeout=900,check=True,env=None):
    print('RUN',name,flush=True)
    with (OUT/(name+'.log')).open('w') as log:
        result=subprocess.run(list(map(str,args)),cwd=cwd,stdout=log,stderr=subprocess.STDOUT,timeout=timeout,env=env)
    if check and result.returncode:
        print((OUT/(name+'.log')).read_text(errors='replace')[-18000:]);raise RuntimeError(name+' failed')
    return result.returncode

def png(color):
    def chunk(name,data):return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data))
    rows=b''.join(b'\0'+bytes(color)*160 for _ in range(160))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',160,160,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('platform',choices=['ios','android']);args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);host=Path(tempfile.mkdtemp(prefix='viewer-native-'))
    lock=json.loads((ROOT/'package-lock.json').read_text())['packages']
    names=['@babel/core','babel-preset-expo','expo','expo-asset','expo-image','expo-video','expo-screen-orientation','expo-status-bar','expo-file-system','react','react-native','react-native-gesture-handler','react-native-reanimated','react-native-worklets','react-native-safe-area-context']
    deps={name:lock['node_modules/'+name]['version'] for name in names}
    core=lock['node_modules/expo-modules-core']['version']
    (host/'package.json').write_text(json.dumps({'name':'viewer-native-regression','version':'1.0.0','private':True,'main':'index.js','dependencies':deps,'overrides':{'expo-modules-core':core}},indent=2))
    (host/'app.json').write_text(json.dumps({'expo':{'name':'ViewerRegression','slug':'viewer-regression','version':'1.0.0','newArchEnabled':True,'ios':{'bundleIdentifier':BUNDLE},'android':{'package':BUNDLE}}}))
    (host/'index.js').write_text(APP)
    (host/'babel.config.js').write_text("module.exports={presets:['babel-preset-expo']};\n")
    for name,color in [('photo1',(200,80,50)),('photo2',(50,180,90)),('photo4',(40,100,200)),('photo5',(160,80,190))]:(host/(name+'.png')).write_bytes(png(color))
    spec=importlib.util.spec_from_file_location('fixture',ROOT/'checks/ios-pin-thumbnail-smoke.py');fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
    (host/'fixture.mp4').write_bytes(base64.b64decode(fixture.FIXTURE))
    for folder in ['features/messenger','styles','services','components']:(host/folder).mkdir(parents=True)
    for name in ['MediaLightbox.tsx','MessengerMediaViewer.tsx','MessengerZoomableMedia.tsx','MessengerVideoPlayer.tsx','MessengerProfileMediaTab.tsx','useMediaViewerLoading.ts','mediaViewerPolicy.ts','types.ts']:
        shutil.copy2(ROOT/'features/messenger'/name,host/'features/messenger'/name)
    (host/'components/Icon.tsx').write_text("import React from 'react';import {Text} from 'react-native';export default function Icon(){return <Text>•</Text>;}\n")
    (host/'styles/commonStyles.ts').write_text('export const colors={white:"white",primary:"#1456a5",textSecondary:"#333",warning:"red",background:"white",text:"black",border:"#aaa"};')
    (host/'services/messengerLogger.ts').write_text('export function messengerLog(){}')
    (host/'services/messengerMediaCache.ts').write_text(CACHE)
    (host/'services/messengerApi.ts').write_text('export function messengerMediaUrl(){return null;}export function messengerErrorMessage(e){return String(e);}')
    (host/'services/messengerMediaSave.ts').write_text('export async function saveMessengerMediaToDevice(){return "media_library";}')
    (host/'services/messengerNativeFilePreview.ts').write_text('export async function openMessengerFilePreview(){}')
    (host/'services/messengerProfileMedia.ts').write_text('import {items} from "./messengerMediaCache";export async function getMessengerRoomMediaPage(){return {items:items.map((m,i)=>({id:"m"+i,kind:m.type,media:m,media_items:[m],created_at:"2026-01-01T00:00:00Z"})),page:{has_more:false,next_cursor:null}};}')
    (OUT/'versions.json').write_text(json.dumps({**deps,'expo-modules-core':core},indent=2));(OUT/'flow.yaml').write_text(FLOW)
    run(['npm','install','--ignore-scripts','--no-audit','--no-fund'],host,'install')
    if args.platform=='ios':run(['git','apply','--unsafe-paths',str(ROOT/'patches/expo-video+3.0.16.patch')],host,'patch-video')
    run(['npx','expo','prebuild','--platform',args.platform,'--no-install'],host,'prebuild')
    if args.platform=='ios':
        run(['pod','install'],host/'ios','pods')
        workspace=next((host/'ios').glob('*.xcworkspace'));derived=host/'build'
        run(['xcodebuild','-workspace',workspace,'-scheme',workspace.stem,'-configuration','Release','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','-derivedDataPath',derived,'CODE_SIGNING_ALLOWED=NO','ONLY_ACTIVE_ARCH=YES','ARCHS='+os.uname().machine,'build'],host,'build',1800)
        devices=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','-j']))['devices']
        sdk = subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-version'],text=True).strip().split('.')
        runtime = '.iOS-'+'-'.join(sdk[:2])
        candidates = [d for r in devices if runtime in r for d in devices[r] if d['name'].startswith('iPhone')]
        assert candidates, 'No simulator matching active Xcode SDK '+runtime
        device = candidates[0]
        (OUT/'simulator.json').write_text(json.dumps(device,indent=2))
        if device['state']!='Booted':run(['xcrun','simctl','boot',device['udid']],host,'boot')
        run(['xcrun','simctl','bootstatus',device['udid'],'-b'],host,'bootstatus',300)
        run(['open','-a','Simulator'],host,'simulator-ui')
        app=next((derived/'Build/Products/Release-iphonesimulator').glob('*.app'))
        run(['xcrun','simctl','install',device['udid'],app],host,'install-app')
        device_args=['--device',device['udid']]
    else:
        run(['./gradlew',':app:assembleRelease','-PreactNativeArchitectures=x86_64','--max-workers=2'],host/'android','build',1800)
        apk=next((host/'android/app/build/outputs/apk/release').glob('*.apk'));run(['adb','install','-r',apk],host,'install-app')
        device_args=[]
    maestro=Path.home()/'.maestro/bin/maestro'
    try:run([maestro,*device_args,'test','--test-output-dir',OUT/'maestro','--debug-output',OUT/'maestro',OUT/'flow.yaml'],host,'ui-test',600)
    finally:
        if args.platform=='android':run(['adb','logcat','-d'],host,'runtime',check=False)
        else:run(['xcrun','simctl','spawn',device['udid'],'log','show','--last','5m','--style','compact','--predicate','process == "ViewerRegression"'],host,'runtime',check=False)
    (OUT/'summary.json').write_text(json.dumps({'platform':args.platform,'passed':True,'scope':'synthetic host, real viewer and gestures; fixture-only cache'}))
if __name__=='__main__':main()
