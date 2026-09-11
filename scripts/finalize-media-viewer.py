from pathlib import Path
p=Path('features/messenger/MessengerAttachmentView.tsx');s=p.read_text()
old='''    setViewerIndex(index);
    try {
      await ensureLocal(item);
    } catch {
      // The fullscreen viewer keeps a visible retry state.
    }
'''
assert old in s
p.write_text(s.replace(old,'''    setViewerIndex(index);
    // The common viewer owns automatic loading for each page, including the first.
'''))
p=Path('checks/media-viewer-runtime.cjs');s=p.read_text();needle='  let closes = 0,'
insert='''  // Both entry points delegate visual-media loading to the common viewer.
  const attachmentSource = fs.readFileSync(path.resolve(__dirname, "../features/messenger/MessengerAttachmentView.tsx"), "utf8");
  const openItemBody = attachmentSource.slice(attachmentSource.indexOf("const openItem ="), attachmentSource.indexOf("const renderAlbum ="));
  assert.doesNotMatch(openItemBody, /await ensureLocal/, "No duplicate initial visual download from the chat tile");
  const profileSource = fs.readFileSync(path.resolve(__dirname, "../features/messenger/MessengerProfileMediaTab.tsx"), "utf8");
  const visualOpen = profileSource.slice(profileSource.indexOf("const index = viewerEntries.findIndex"), profileSource.indexOf("const showActions"));
  assert.doesNotMatch(visualOpen, /await ensureLocal/, "Profile must open immediately and load via the common viewer");
  let closes = 0,'''
assert needle in s;p.write_text(s.replace(needle,insert))
p=Path('checks/media-viewer-native-smoke.py');s=p.read_text().replace("names=['expo',", "names=['@babel/core','babel-preset-expo','expo',");p.write_text(s)
p=Path('docs/CHAT_PINNING.md');s=p.read_text()
start=s.index('Тень `NavigationSurface` использует SVG');end=s.index('\n\nПатчи применяются',start)
s=s[:start]+'''Тень `NavigationSurface` использует SVG `FeGaussianBlur`. Реализация фильтров
`react-native-svg` делала снимок BackgroundImage из UIKit display-list context,
в котором нет растрового формата. Проверка через `CGBitmapContextGetBitsPerPixel`
тоже недопустима для этого контекста и сама вызывала предупреждение. Поэтому
исправленный патч `react-native-svg+15.12.1` не определяет тип внешнего контекста:
SVG, содержащие фильтры, рисуются через собственный `UIGraphicsImageRenderer`,
после чего готовое изображение переносится на экран. У фильтра теперь настоящий
растровый фон, включая BackgroundImage; SourceGraphic, геометрия и размытие
тени сохранены. SVG без фильтров рисуются прежним способом. Фото/видео
пользователей не перекодируются. Android и веб-код зависимостей не изменены.'''+s[end:]
s+='''

## Просмотрщик: свайп вниз и автоматическая загрузка

Общий `MessengerMediaViewer` используется и вложениями чата, и разделом «Медиа»
профиля. Загрузка текущего фото или видео запускается при открытии и при смене
индекса, а не только в обработчике первоначального нажатия в профиле. Открытие
не ждёт загрузки: доступны индикатор и закрытие. Соседние фотографии загружаются
заранее; соседние видео не скачиваются целиком до перехода на них. Работают
прежний авторизованный загрузчик и кэш; серверный API не меняется.

Одна автоматическая попытка на посещение страницы, без циклических повторов
при ошибке. Повторное посещение может повторить запрос, уже выполняющийся запрос
на тот же ID не дублируется. Реальная ошибка предлагает повторить загрузку вручную.
Завершение фоновой загрузки не меняет индекс и не открывает закрытое окно заново.

На iOS и Android вертикальное движение одним пальцем вниз закрывает просмотрщик
после достаточного расстояния либо быстрого короткого жеста. Незавершённый жест
возвращает изображение на место. Горизонтальный жест остаётся перелистыванием.
При увеличении вертикальный жест перемещает изображение, но не закрывает окно;
сначала нужно вернуть обычный масштаб. Pinch и двойной тап сохранены. Обновление
URI соседнего файла или callback родителя не сбрасывает текущий масштаб.
Кнопка закрытия и Android Back сохраняются; закрытие доступно и во время загрузки.

Проверки: `PIN_TEST_MODULES=/tmp/forward-pin-tests npm run check:media-viewer`
после установки react@19.1.0/react-test-renderer@19.1.0 в указанный тестовый каталог.
Нативный UI-прогон на синтетических медиа: `python3 checks/media-viewer-native-smoke.py ios`
или `android`; необходимы соответствующий SDK/симулятор и Maestro.
Это настоящий просмотрщик/вкладка профиля/жесты с тестовыми API и кэшем,
не проверка полного приложения с рабочими аккаунтами.

Проверка графики сравнивает именно прежний опубликованный патч с новым и учитывает
все `CGBitmapContext*` / `CGDisplayList*` invalid context, включая ошибку самого
GetBitsPerPixel. Предыдущий узкий подсчёт четырёх старых сообщений был недостаточен.
'''
p.write_text(s)
