from pathlib import Path
import json
p = Path('checks/messenger-pin-presentation.cjs')
s = p.read_text()
old = 'assert.equal(players[0].time, 0);'
assert s.count(old) == 1
p.write_text(s.replace(old, 'assert.deepEqual(players[0].time, [0], "SDK 54 iOS native bridge requires an array");'))
p = Path('package.json')
s = json.loads(p.read_text())
s['scripts']['check:messenger-pin-thumbnail'] = 'node checks/messenger-pin-thumbnail-contract.cjs'
s['scripts']['check'] = s['scripts']['check'].replace(' && npm run typecheck', ' && npm run check:messenger-pin-thumbnail && npm run typecheck')
p.write_text(json.dumps(s, ensure_ascii=False, indent=2) + '\n')
p = Path('docs/CHAT_PINNING.md')
p.write_text(p.read_text() + '\n## iOS SDK 54: безопасный аргумент видеоминиатюры\n\nДля первого кадра передаётся `generateThumbnailsAsync([0], options)`, не число `0`.\nТипы expo-video разрешают оба варианта, но нативное преобразование числа в массив\nв expo-modules-core SDK 54 вызывает iOS-сбой (expo/expo#43372, исправление #42694\nв SDK 55). Ошибка может возникать при входе в чат до первого нажатия на закрепление.\nИзвлечение кадра не отключено. Навигация/измерения, Android-отступы, API и БД\nне изменяются. Обновление Expo SDK не требуется. Проверка формы аргумента,\nосвобождения плеера и отмены: `npm run check:messenger-pin-thumbnail`.\nТесты с подменой моста не заменяют проверку реальной iOS-библиотеки; для неё\nесть изолированный simulator harness `checks/ios-pin-thumbnail-smoke.py`.\n')
