from pathlib import Path
p=Path('checks/ios-media-lifecycle-smoke.py')
s=p.read_text()
s=s.replace("PATCHES = ['expo-video+3.0.16.patch', 'react-native-svg+15.12.1.patch']", "BASE = '3824b6df875134e0f42d923de9c57da3ac425135'\nGRAPHICS_WARNINGS = r\"Unsupported image format 'UNKNOWN'|(?:CGBitmapContext\\w*|CGDisplayList\\w*): (?:unsupported|invalid context)\"")
s=s.replace("    outcomes={}\n    for mode", "    # Reproduce the shipped invalid bitmap probe, not just the original warning.\n    old_patch = host/'previous-svg.patch'\n    old_patch.write_bytes(subprocess.check_output(['git','show',BASE+':patches/react-native-svg+15.12.1.patch'],cwd=ROOT))\n    run(['git','apply','--unsafe-paths',str(ROOT/'patches/expo-video+3.0.16.patch')],host,'apply-video')\n    run(['git','apply','--unsafe-paths',str(old_patch)],host,'apply-previous-svg')\n    outcomes={}\n    for mode")
s=s.replace("            for patch in PATCHES:\n                run(['git','apply','--unsafe-paths',str(ROOT/'patches'/patch)],host,'apply-'+patch)", "            run(['git','apply','-R','--unsafe-paths',str(old_patch)],host,'remove-previous-svg')\n            run(['git','apply','--unsafe-paths',str(ROOT/'patches/react-native-svg+15.12.1.patch')],host,'apply-owned-svg')")
s=s.replace('len(re.findall("Unsupported image format \'UNKNOWN\'|CGBitmapContextCreate: unsupported|CGDisplayListDrawInContext: invalid|CGBitmapContextCreateImage: invalid",text))','len(re.findall(GRAPHICS_WARNINGS,text))')
s=s.replace("    assert summary['passed'],'Fixed probe failed or retained media warnings'", "    assert outcomes['baseline']['bitmapErrors'] > 0,'Previous invalid bitmap probe was not reproduced'\n    assert summary['passed'],'Fixed probe failed or retained media warnings'")
p.write_text(s)
p=Path('checks/ios-media-patch-contract.cjs');s=p.read_text()
start=s.index('const svg = read(');end=s.index('assert.match(\n  read("components/',start)
s=s[:start]+'''const svg = read("node_modules/react-native-svg/apple/Elements/RNSVGSvgView.mm");
assert.match(svg, /RNSVGContainsFilter\\(self\\)/);
assert.match(svg, /UIGraphicsImageRenderer \\*renderer/);
assert.match(svg, /drawToContext:rendererContext.CGContext/);
assert.match(svg, /\\[image drawInRect:bounds\\]/);
assert.doesNotMatch(
  read("node_modules/react-native-svg/apple/RNSVGRenderable.mm"),
  /CGBitmapContextGet(?:BitsPerPixel|BitsPerComponent|Data|ColorSpace)\\(context\\)/,
  "Do not probe a UIKit display list with a bitmap-only function",
);
''' +s[end:]
p.write_text(s)
