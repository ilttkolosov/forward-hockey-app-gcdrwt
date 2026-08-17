import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

fileprivate enum ForwardTextFormat: CaseIterable, Hashable {
  case bold
  case italic
  case underline
  case strikethrough

  var token: String {
    switch self {
    case .bold: return "\u{2063}\u{2063}"
    case .italic: return "\u{2062}\u{2062}"
    case .underline: return "\u{2061}\u{2061}"
    case .strikethrough: return "\u{2060}\u{2060}"
    }
  }

  var title: String {
    switch self {
    case .bold: return "Жирный"
    case .italic: return "Курсив"
    case .underline: return "Подчёркнутый"
    case .strikethrough: return "Зачёркнутый"
    }
  }

  var imageName: String {
    switch self {
    case .bold: return "bold"
    case .italic: return "italic"
    case .underline: return "underline"
    case .strikethrough: return "strikethrough"
    }
  }
}

fileprivate final class ForwardAttributedTextView: UITextView {
  weak var formattingOwner: ForwardRichTextInputView?

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(formatBold(_:)) ||
      action == #selector(formatItalic(_:)) ||
      action == #selector(formatUnderline(_:)) ||
      action == #selector(formatStrikethrough(_:)) {
      return selectedRange.length > 0
    }
    if action == #selector(paste(_:)),
      formattingOwner?.canPasteAttachmentFromPasteboard() == true {
      return true
    }
    return super.canPerformAction(action, withSender: sender)
  }

  override func paste(_ sender: Any?) {
    if formattingOwner?.pasteAttachmentFromPasteboard() == true {
      return
    }
    super.paste(sender)
  }

  @objc fileprivate func formatBold(_ sender: Any?) {
    formattingOwner?.toggleFormat(.bold)
  }

  @objc fileprivate func formatItalic(_ sender: Any?) {
    formattingOwner?.toggleFormat(.italic)
  }

  @objc fileprivate func formatUnderline(_ sender: Any?) {
    formattingOwner?.toggleFormat(.underline)
  }

  @objc fileprivate func formatStrikethrough(_ sender: Any?) {
    formattingOwner?.toggleFormat(.strikethrough)
  }
}

public final class ForwardRichTextInputView: ExpoView, UITextViewDelegate {
  private struct EmbeddedImage {
    let range: NSRange
    let data: Data
    let contentType: UTType
    let suggestedName: String
  }

  let onValueChange = EventDispatcher()
  let onFocus = EventDispatcher()
  let onBlur = EventDispatcher()
  let onContentSizeChange = EventDispatcher()
  let onPasteAttachment = EventDispatcher()

  private let editor = ForwardAttributedTextView(frame: .zero, textContainer: nil)
  private let placeholderLabel = UILabel()
  private var suppressEvents = false
  private var lastContentHeight: CGFloat = -1

  var placeholder = "" {
    didSet {
      placeholderLabel.text = placeholder
      updatePlaceholder()
    }
  }

  var placeholderTextColor = UIColor.placeholderText {
    didSet { placeholderLabel.textColor = placeholderTextColor }
  }

  var editorTextColor = UIColor.label {
    didSet {
      editor.textColor = editorTextColor
      editor.textStorage.addAttribute(
        .foregroundColor,
        value: editorTextColor,
        range: NSRange(location: 0, length: editor.textStorage.length)
      )
      updateTypingAttributes()
    }
  }

  var selectionColor = UIColor.systemBlue {
    didSet { editor.tintColor = selectionColor }
  }

  var fontSize: CGFloat = 16 {
    didSet {
      updateStoredFontSize()
      placeholderLabel.font = UIFont.systemFont(ofSize: fontSize)
      updateTypingAttributes()
      emitContentHeight()
    }
  }

  var maxLength = 4000

  var pasteAttachmentsEnabled = false

  var isEditable = true {
    didSet {
      editor.isEditable = isEditable
      editor.isSelectable = isEditable
    }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    editor.formattingOwner = self
    editor.delegate = self
    editor.translatesAutoresizingMaskIntoConstraints = false
    editor.backgroundColor = .clear
    editor.isScrollEnabled = true
    editor.alwaysBounceVertical = false
    editor.textContainerInset = UIEdgeInsets(top: 11, left: 9, bottom: 11, right: 9)
    editor.textContainer.lineFragmentPadding = 5
    editor.font = UIFont.systemFont(ofSize: fontSize)
    editor.textColor = editorTextColor
    editor.tintColor = selectionColor
    editor.keyboardDismissMode = .interactive
    editor.accessibilityLabel = "Сообщение"

    placeholderLabel.font = UIFont.systemFont(ofSize: fontSize)
    placeholderLabel.textColor = placeholderTextColor
    placeholderLabel.numberOfLines = 1
    placeholderLabel.isUserInteractionEnabled = false
    editor.addSubview(placeholderLabel)

    addSubview(editor)
    NSLayoutConstraint.activate([
      editor.topAnchor.constraint(equalTo: topAnchor),
      editor.bottomAnchor.constraint(equalTo: bottomAnchor),
      editor.leadingAnchor.constraint(equalTo: leadingAnchor),
      editor.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])
    updateTypingAttributes()
    updatePlaceholder()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    layoutPlaceholder()
    emitContentHeight()
  }

  func setEncodedValue(_ value: String) {
    if encodeAttributedText() == value { return }

    suppressEvents = true
    editor.attributedText = decodeAttributedText(value)
    editor.selectedRange = NSRange(location: editor.textStorage.length, length: 0)
    suppressEvents = false
    updateTypingAttributes()
    updatePlaceholder()
    emitContentHeight()
  }

  func focusEditor() {
    editor.becomeFirstResponder()
  }

  func blurEditor() {
    editor.resignFirstResponder()
  }

  public func textViewDidBeginEditing(_ textView: UITextView) {
    installLegacyMenuItemsIfNeeded()
    onFocus([:])
  }

  public func textViewDidEndEditing(_ textView: UITextView) {
    if #unavailable(iOS 16.0) {
      UIMenuController.shared.menuItems = nil
    }
    onBlur([:])
  }

  public func textViewDidChange(_ textView: UITextView) {
    // Memoji stickers and Genmoji are inserted by the iOS text system as an
    // attributed-string attachment, not as ordinary characters. If they are
    // serialized through `textView.text`, only U+FFFC reaches JavaScript and
    // both users see an empty bubble. Promote the embedded image to the normal
    // messenger attachment flow before emitting the residual caption text.
    if captureEmbeddedImageIfNeeded(from: textView) { return }
    updatePlaceholder()
    emitValueChange()
    emitContentHeight()
  }

  public func textViewDidChangeSelection(_ textView: UITextView) {
    guard !suppressEvents, textView.selectedRange.length == 0 else { return }
    updateTypingAttributes()
  }

  public func textView(
    _ textView: UITextView,
    shouldChangeTextIn range: NSRange,
    replacementText text: String
  ) -> Bool {
    if textView.markedTextRange != nil { return true }
    let nextLength = (textView.text as NSString).length - range.length + (text as NSString).length
    guard nextLength <= maxLength else { return false }
    if !text.isEmpty {
      updateTypingAttributes()
    }
    return true
  }

  @available(iOS 16.0, *)
  public func textView(
    _ textView: UITextView,
    editMenuForTextIn range: NSRange,
    suggestedActions: [UIMenuElement]
  ) -> UIMenu? {
    makeEditMenu(for: range, suggestedActions: suggestedActions)
  }

  @available(iOS 26.0, *)
  public func textView(
    _ textView: UITextView,
    editMenuForTextInRanges ranges: [NSValue],
    suggestedActions: [UIMenuElement]
  ) -> UIMenu? {
    let selectedRange = ranges
      .map(\.rangeValue)
      .first(where: { $0.length > 0 }) ?? textView.selectedRange
    return makeEditMenu(for: selectedRange, suggestedActions: suggestedActions)
  }

  @available(iOS 16.0, *)
  private func makeEditMenu(
    for range: NSRange,
    suggestedActions: [UIMenuElement]
  ) -> UIMenu {
    guard range.length > 0 else { return UIMenu(children: suggestedActions) }

    let formatActions = ForwardTextFormat.allCases.map { format in
      let action = UIAction(
        title: format.title,
        image: UIImage(systemName: format.imageName)
      ) { [weak self] _ in
        self?.toggleFormat(format)
      }
      action.state = isFormatApplied(format, range: range) ? .on : .off
      return action
    }
    let formatMenu = UIMenu(
      title: "Формат",
      image: UIImage(systemName: "textformat"),
      children: formatActions
    )
    // Keep the formatting submenu on the first page of the compact edit menu.
    return UIMenu(children: [formatMenu] + suggestedActions)
  }

  fileprivate func toggleFormat(_ format: ForwardTextFormat) {
    let range = editor.selectedRange
    guard range.length > 0, NSMaxRange(range) <= editor.textStorage.length else { return }

    let shouldRemove = isFormatApplied(format, range: range)
    switch format {
    case .bold:
      updateFontTrait(.traitBold, range: range, enabled: !shouldRemove)
    case .italic:
      updateFontTrait(.traitItalic, range: range, enabled: !shouldRemove)
    case .underline:
      if shouldRemove {
        editor.textStorage.removeAttribute(.underlineStyle, range: range)
      } else {
        editor.textStorage.addAttribute(
          .underlineStyle,
          value: NSUnderlineStyle.single.rawValue,
          range: range
        )
      }
    case .strikethrough:
      if shouldRemove {
        editor.textStorage.removeAttribute(.strikethroughStyle, range: range)
      } else {
        editor.textStorage.addAttribute(
          .strikethroughStyle,
          value: NSUnderlineStyle.single.rawValue,
          range: range
        )
      }
    }

    editor.selectedRange = range
    updateTypingAttributes()
    editor.becomeFirstResponder()
    emitValueChange()
    emitContentHeight()
  }

  private func emitValueChange() {
    guard !suppressEvents else { return }
    onValueChange(["value": encodeAttributedText()])
  }

  private func emitContentHeight() {
    guard bounds.width > 0 else { return }
    let targetSize = CGSize(width: bounds.width, height: CGFloat.greatestFiniteMagnitude)
    let height = ceil(editor.sizeThatFits(targetSize).height)
    guard abs(height - lastContentHeight) >= 0.5 else { return }
    lastContentHeight = height
    onContentSizeChange(["height": height])
  }

  private func updatePlaceholder() {
    placeholderLabel.isHidden = !editor.text.isEmpty
    layoutPlaceholder()
  }

  private func layoutPlaceholder() {
    let left = editor.textContainerInset.left + editor.textContainer.lineFragmentPadding
    let top = editor.textContainerInset.top
    let width = max(0, editor.bounds.width - left - editor.textContainerInset.right)
    placeholderLabel.frame = CGRect(x: left, y: top, width: width, height: ceil(fontSize * 1.35))
  }

  private func updateTypingAttributes() {
    var attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: fontSize),
      .foregroundColor: editorTextColor
    ]
    if let paragraphStyle = editor.typingAttributes[.paragraphStyle] {
      attributes[.paragraphStyle] = paragraphStyle
    }
    editor.typingAttributes = attributes
  }

  private func updateStoredFontSize() {
    let fullRange = NSRange(location: 0, length: editor.textStorage.length)
    editor.textStorage.enumerateAttribute(.font, in: fullRange) { value, range, _ in
      let currentFont = value as? UIFont ?? UIFont.systemFont(ofSize: fontSize)
      editor.textStorage.addAttribute(
        .font,
        value: UIFont(descriptor: currentFont.fontDescriptor, size: fontSize),
        range: range
      )
    }
  }

  private func updateFontTrait(
    _ trait: UIFontDescriptor.SymbolicTraits,
    range: NSRange,
    enabled: Bool
  ) {
    editor.textStorage.enumerateAttribute(.font, in: range) { value, subrange, _ in
      let currentFont = value as? UIFont ?? UIFont.systemFont(ofSize: fontSize)
      var traits = currentFont.fontDescriptor.symbolicTraits
      if enabled { traits.insert(trait) } else { traits.remove(trait) }
      let descriptor = currentFont.fontDescriptor.withSymbolicTraits(traits) ?? currentFont.fontDescriptor
      editor.textStorage.addAttribute(
        .font,
        value: UIFont(descriptor: descriptor, size: fontSize),
        range: subrange
      )
    }
  }

  private func isFormatApplied(_ format: ForwardTextFormat, range: NSRange) -> Bool {
    guard range.length > 0, NSMaxRange(range) <= editor.textStorage.length else { return false }
    var covered = true
    editor.textStorage.enumerateAttributes(in: range) { attributes, _, stop in
      let active: Bool
      switch format {
      case .bold:
        active = (attributes[.font] as? UIFont)?.fontDescriptor.symbolicTraits.contains(.traitBold) == true
      case .italic:
        active = (attributes[.font] as? UIFont)?.fontDescriptor.symbolicTraits.contains(.traitItalic) == true
      case .underline:
        active = decorationStyleIsEnabled(attributes[.underlineStyle])
      case .strikethrough:
        active = decorationStyleIsEnabled(attributes[.strikethroughStyle])
      }
      if !active {
        covered = false
        stop.pointee = true
      }
    }
    return covered
  }

  private func installLegacyMenuItemsIfNeeded() {
    if #available(iOS 16.0, *) { return }
    UIMenuController.shared.menuItems = [
      UIMenuItem(title: "Жирный", action: #selector(ForwardAttributedTextView.formatBold(_:))),
      UIMenuItem(title: "Курсив", action: #selector(ForwardAttributedTextView.formatItalic(_:))),
      UIMenuItem(title: "Подчёркнутый", action: #selector(ForwardAttributedTextView.formatUnderline(_:))),
      UIMenuItem(title: "Зачёркнутый", action: #selector(ForwardAttributedTextView.formatStrikethrough(_:)))
    ]
  }

  fileprivate func canPasteAttachmentFromPasteboard() -> Bool {
    guard pasteAttachmentsEnabled else { return false }
    let pasteboard = UIPasteboard.general
    if pasteboard.hasImages { return true }
    if pasteboard.itemProviders.contains(where: { provider in
      provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
    }) {
      return true
    }
    return pasteboard.itemProviders.contains { preferredAttachmentType(for: $0) != nil }
  }

  fileprivate func pasteAttachmentFromPasteboard() -> Bool {
    guard pasteAttachmentsEnabled else { return false }
    let pasteboard = UIPasteboard.general

    if let image = pasteboard.image, let data = image.pngData() {
      cacheAndEmitPastedImageData(
        data,
        contentType: .png,
        suggestedName: "sticker-\(Int(Date().timeIntervalSince1970)).png"
      )
      return true
    }

    if let sourceURL = pasteboard.urls?.first(where: { $0.isFileURL }) {
      cacheAndEmitPastedFile(
        sourceURL,
        suggestedName: sourceURL.lastPathComponent,
        contentType: UTType(filenameExtension: sourceURL.pathExtension)
      )
      return true
    }

    guard let provider = pasteboard.itemProviders.first(where: {
      preferredAttachmentType(for: $0) != nil
    }), let contentType = preferredAttachmentType(for: provider) else {
      return false
    }

    provider.loadFileRepresentation(forTypeIdentifier: contentType.identifier) { [weak self] url, error in
      guard let self else { return }
      guard let url else {
        self.emitPasteAttachmentError(error?.localizedDescription ?? "Не удалось прочитать вложение из буфера обмена")
        return
      }
      do {
        let payload = try self.cachePastedFile(
          from: url,
          suggestedName: provider.suggestedName,
          contentType: contentType
        )
        DispatchQueue.main.async { [weak self] in
          self?.onPasteAttachment(payload)
        }
      } catch {
        self.emitPasteAttachmentError(error.localizedDescription)
      }
    }
    return true
  }

  private func preferredAttachmentType(for provider: NSItemProvider) -> UTType? {
    let contentTypes = provider.registeredTypeIdentifiers.compactMap { UTType($0) }
    if let image = contentTypes.first(where: { $0.conforms(to: .image) }) {
      return image
    }
    if let movie = contentTypes.first(where: { $0.conforms(to: .movie) }) {
      return movie
    }
    return contentTypes.first { type in
      !type.conforms(to: .text) &&
        !type.conforms(to: .url) &&
        (type.conforms(to: .content) || type.conforms(to: .data))
    }
  }

  private func cacheAndEmitPastedFile(
    _ sourceURL: URL,
    suggestedName: String?,
    contentType: UTType?
  ) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      do {
        let payload = try self.cachePastedFile(
          from: sourceURL,
          suggestedName: suggestedName,
          contentType: contentType
        )
        DispatchQueue.main.async { [weak self] in
          self?.onPasteAttachment(payload)
        }
      } catch {
        self.emitPasteAttachmentError(error.localizedDescription)
      }
    }
  }

  private func cacheAndEmitPastedImageData(
    _ data: Data,
    contentType: UTType,
    suggestedName: String
  ) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      do {
        let payload = try self.cachePastedImageData(
          data,
          contentType: contentType,
          suggestedName: suggestedName
        )
        DispatchQueue.main.async { [weak self] in
          self?.onPasteAttachment(payload)
        }
      } catch {
        self.emitPasteAttachmentError(error.localizedDescription)
      }
    }
  }

  private func captureEmbeddedImageIfNeeded(from textView: UITextView) -> Bool {
    guard pasteAttachmentsEnabled,
      let embedded = firstEmbeddedImage(in: textView.attributedText)
    else {
      return false
    }

    do {
      let payload = try cachePastedImageData(
        embedded.data,
        contentType: embedded.contentType,
        suggestedName: embedded.suggestedName
      )
      suppressEvents = true
      textView.textStorage.deleteCharacters(in: embedded.range)
      textView.selectedRange = NSRange(
        location: min(embedded.range.location, textView.textStorage.length),
        length: 0
      )
      suppressEvents = false
      updateTypingAttributes()
      updatePlaceholder()
      emitValueChange()
      emitContentHeight()
      onPasteAttachment(payload)
      return true
    } catch {
      emitPasteAttachmentError(error.localizedDescription)
      return false
    }
  }

  private func firstEmbeddedImage(in attributed: NSAttributedString?) -> EmbeddedImage? {
    guard let attributed, attributed.length > 0 else { return nil }
    var result: EmbeddedImage?
    attributed.enumerateAttributes(
      in: NSRange(location: 0, length: attributed.length),
      options: []
    ) { attributes, range, stop in
      if let attachment = attributes[.attachment] as? NSTextAttachment,
        let normalized = self.normalizedAttachmentImage(attachment, at: range.location) {
        result = EmbeddedImage(
          range: range,
          data: normalized.data,
          contentType: normalized.contentType,
          suggestedName: normalized.name
        )
        stop.pointee = true
        return
      }

      if #available(iOS 18.0, *),
        let glyph = attributes[.adaptiveImageGlyph] as? NSAdaptiveImageGlyph {
        let sourceData = glyph.imageContent
        if let image = UIImage(data: sourceData), let png = image.pngData() {
          result = EmbeddedImage(
            range: range,
            data: png,
            contentType: .png,
            suggestedName: "adaptive-sticker-\(glyph.contentIdentifier).png"
          )
        } else {
          result = EmbeddedImage(
            range: range,
            data: sourceData,
            contentType: NSAdaptiveImageGlyph.contentType,
            suggestedName: "adaptive-sticker-\(glyph.contentIdentifier).heic"
          )
        }
        stop.pointee = true
      }
    }
    return result
  }

  private func normalizedAttachmentImage(
    _ attachment: NSTextAttachment,
    at characterIndex: Int
  ) -> (data: Data, contentType: UTType, name: String)? {
    let wrappedName = attachment.fileWrapper?.preferredFilename
    let declaredType = attachment.fileType.flatMap { UTType($0) }
      ?? wrappedName.flatMap { UTType(filenameExtension: URL(fileURLWithPath: $0).pathExtension) }
    let originalData = attachment.contents ?? attachment.fileWrapper?.regularFileContents

    if let originalData, originalData.starts(with: Data("GIF8".utf8)) {
      return (
        originalData,
        .gif,
        wrappedName ?? "sticker-\(Int(Date().timeIntervalSince1970)).gif"
      )
    }

    let image = attachment.image ?? attachment.image(
      forBounds: attachment.bounds,
      textContainer: editor.textContainer,
      characterIndex: characterIndex
    ) ?? originalData.flatMap { UIImage(data: $0) }
    if let image, let png = image.pngData() {
      return (
        png,
        .png,
        "sticker-\(Int(Date().timeIntervalSince1970)).png"
      )
    }

    guard let originalData,
      let declaredType,
      declaredType.conforms(to: .image)
    else {
      return nil
    }
    let fileExtension = declaredType.preferredFilenameExtension ?? "img"
    return (
      originalData,
      declaredType,
      wrappedName ?? "sticker-\(Int(Date().timeIntervalSince1970)).\(fileExtension)"
    )
  }

  private func cachePastedImageData(
    _ data: Data,
    contentType: UTType,
    suggestedName: String
  ) throws -> [String: Any] {
    guard !data.isEmpty else {
      throw NSError(
        domain: "ForwardRichTextInput",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Вставленное изображение пусто"]
      )
    }
    let fileManager = FileManager.default
    guard let cachesDirectory = fileManager.urls(
      for: .cachesDirectory,
      in: .userDomainMask
    ).first else {
      throw NSError(
        domain: "ForwardRichTextInput",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Локальное хранилище для вставки файла недоступно"]
      )
    }
    let clipboardDirectory = cachesDirectory.appendingPathComponent(
      "forward-messenger-clipboard",
      isDirectory: true
    )
    try fileManager.createDirectory(
      at: clipboardDirectory,
      withIntermediateDirectories: true
    )
    let safeName = URL(fileURLWithPath: suggestedName).lastPathComponent
    let destinationURL = clipboardDirectory.appendingPathComponent(
      "\(UUID().uuidString)-\(safeName)",
      isDirectory: false
    )
    try data.write(to: destinationURL, options: .atomic)
    return [
      "kind": "image",
      "uri": destinationURL.absoluteString,
      "name": safeName,
      "mimeType": contentType.preferredMIMEType ?? "image/png",
      "sizeBytes": NSNumber(value: data.count)
    ]
  }

  private func cachePastedFile(
    from sourceURL: URL,
    suggestedName: String?,
    contentType: UTType?
  ) throws -> [String: Any] {
    let fileManager = FileManager.default
    guard let cachesDirectory = fileManager.urls(
      for: .cachesDirectory,
      in: .userDomainMask
    ).first else {
      throw NSError(
        domain: "ForwardRichTextInput",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Локальное хранилище для вставки файла недоступно"]
      )
    }

    let clipboardDirectory = cachesDirectory.appendingPathComponent(
      "forward-messenger-clipboard",
      isDirectory: true
    )
    try fileManager.createDirectory(
      at: clipboardDirectory,
      withIntermediateDirectories: true
    )

    let resolvedType = contentType ?? UTType(filenameExtension: sourceURL.pathExtension)
    let resolvedName = pastedFileName(
      suggestedName: suggestedName,
      sourceURL: sourceURL,
      contentType: resolvedType
    )
    let destinationURL = clipboardDirectory.appendingPathComponent(
      "\(UUID().uuidString)-\(resolvedName)",
      isDirectory: false
    )
    let accessedSecurityScope = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if accessedSecurityScope {
        sourceURL.stopAccessingSecurityScopedResource()
      }
    }
    try fileManager.copyItem(at: sourceURL, to: destinationURL)

    let attributes = try fileManager.attributesOfItem(atPath: destinationURL.path)
    let sizeBytes = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    let kind: String
    if resolvedType?.conforms(to: .image) == true {
      kind = "image"
    } else if resolvedType?.conforms(to: .movie) == true {
      kind = "video"
    } else {
      kind = "file"
    }
    return [
      "kind": kind,
      "uri": destinationURL.absoluteString,
      "name": resolvedName,
      "mimeType": resolvedType?.preferredMIMEType ?? "application/octet-stream",
      "sizeBytes": NSNumber(value: sizeBytes)
    ]
  }

  private func pastedFileName(
    suggestedName: String?,
    sourceURL: URL,
    contentType: UTType?
  ) -> String {
    let candidate = suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines)
    var name = candidate.flatMap { $0.isEmpty ? nil : $0 } ?? sourceURL.lastPathComponent
    if name.isEmpty {
      name = "clipboard-\(Int(Date().timeIntervalSince1970))"
    }
    name = URL(fileURLWithPath: name).lastPathComponent
    if URL(fileURLWithPath: name).pathExtension.isEmpty,
      let fileExtension = contentType?.preferredFilenameExtension {
      name += ".\(fileExtension)"
    }
    return name
  }

  private func emitPasteAttachmentError(_ message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.onPasteAttachment(["error": message])
    }
  }

  private func decodeAttributedText(_ encoded: String) -> NSAttributedString {
    let source = encoded as NSString
    let plain = NSMutableString(string: "")
    var cursor = 0
    var active: [ForwardTextFormat: Int] = [:]
    var ranges: [(ForwardTextFormat, NSRange)] = []

    while cursor < source.length {
      var matchedFormat: ForwardTextFormat?
      for format in ForwardTextFormat.allCases {
        let tokenLength = (format.token as NSString).length
        guard cursor + tokenLength <= source.length else { continue }
        if source.substring(with: NSRange(location: cursor, length: tokenLength)) == format.token {
          matchedFormat = format
          break
        }
      }

      guard let format = matchedFormat else {
        let nextTokenLocation = ForwardTextFormat.allCases.compactMap { candidate -> Int? in
          let searchRange = NSRange(location: cursor, length: source.length - cursor)
          let result = source.range(of: candidate.token, options: [], range: searchRange)
          return result.location == NSNotFound ? nil : result.location
        }.min() ?? source.length
        let chunkLength = max(1, nextTokenLocation - cursor)
        plain.append(source.substring(with: NSRange(location: cursor, length: chunkLength)))
        cursor += chunkLength
        continue
      }

      let tokenLength = (format.token as NSString).length
      if let start = active.removeValue(forKey: format) {
        let length = plain.length - start
        if length > 0 { ranges.append((format, NSRange(location: start, length: length))) }
      } else if hasMeaningfulClosingToken(format, source: source, cursor: cursor) {
        active[format] = plain.length
      } else {
        plain.append(format.token)
      }
      cursor += tokenLength
    }

    let attributed = NSMutableAttributedString(
      string: plain as String,
      attributes: [
        .font: UIFont.systemFont(ofSize: fontSize),
        .foregroundColor: editorTextColor
      ]
    )
    for (format, range) in ranges {
      switch format {
      case .bold:
        applyFontTrait(.traitBold, to: attributed, range: range)
      case .italic:
        applyFontTrait(.traitItalic, to: attributed, range: range)
      case .underline:
        attributed.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
      case .strikethrough:
        attributed.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range)
      }
    }
    return attributed
  }

  private func hasMeaningfulClosingToken(
    _ format: ForwardTextFormat,
    source: NSString,
    cursor: Int
  ) -> Bool {
    let tokenLength = (format.token as NSString).length
    let searchStart = cursor + tokenLength
    guard searchStart < source.length else { return false }
    let closing = source.range(
      of: format.token,
      options: [],
      range: NSRange(location: searchStart, length: source.length - searchStart)
    )
    guard closing.location != NSNotFound else { return false }
    let content = source.substring(
      with: NSRange(location: searchStart, length: closing.location - searchStart)
    )
    return !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func applyFontTrait(
    _ trait: UIFontDescriptor.SymbolicTraits,
    to value: NSMutableAttributedString,
    range: NSRange
  ) {
    value.enumerateAttribute(.font, in: range) { current, subrange, _ in
      let currentFont = current as? UIFont ?? UIFont.systemFont(ofSize: fontSize)
      let traits = currentFont.fontDescriptor.symbolicTraits.union(trait)
      let descriptor = currentFont.fontDescriptor.withSymbolicTraits(traits) ?? currentFont.fontDescriptor
      value.addAttribute(.font, value: UIFont(descriptor: descriptor, size: fontSize), range: subrange)
    }
  }

  private func encodeAttributedText() -> String {
    let attributed = editor.attributedText ?? NSAttributedString(string: "")
    let length = attributed.length
    guard length > 0 else { return "" }

    var insertions: [Int: [String]] = [:]
    for format in ForwardTextFormat.allCases {
      var rangeStart: Int?
      for index in 0...length {
        let active = index < length && isFormatApplied(format, attributes: attributed.attributes(at: index, effectiveRange: nil))
        if active, rangeStart == nil {
          rangeStart = index
        } else if !active, let start = rangeStart {
          insertions[start, default: []].append(format.token)
          insertions[index, default: []].append(format.token)
          rangeStart = nil
        }
      }
    }

    let result = NSMutableString(string: attributed.string)
    for offset in insertions.keys.sorted(by: >) {
      result.insert(insertions[offset, default: []].joined(), at: offset)
    }
    return result as String
  }

  private func isFormatApplied(
    _ format: ForwardTextFormat,
    attributes: [NSAttributedString.Key: Any]
  ) -> Bool {
    switch format {
    case .bold:
      return (attributes[.font] as? UIFont)?.fontDescriptor.symbolicTraits.contains(.traitBold) == true
    case .italic:
      return (attributes[.font] as? UIFont)?.fontDescriptor.symbolicTraits.contains(.traitItalic) == true
    case .underline:
      return decorationStyleIsEnabled(attributes[.underlineStyle])
    case .strikethrough:
      return decorationStyleIsEnabled(attributes[.strikethroughStyle])
    }
  }

  private func decorationStyleIsEnabled(_ value: Any?) -> Bool {
    ((value as? NSNumber)?.intValue ?? 0) != 0
  }
}
