import ExpoModulesCore
import UIKit

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
    return super.canPerformAction(action, withSender: sender)
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
  let onValueChange = EventDispatcher()
  let onFocus = EventDispatcher()
  let onBlur = EventDispatcher()
  let onContentSizeChange = EventDispatcher()

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

  func textViewDidBeginEditing(_ textView: UITextView) {
    installLegacyMenuItemsIfNeeded()
    onFocus([:])
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    if #unavailable(iOS 16.0) {
      UIMenuController.shared.menuItems = nil
    }
    onBlur([:])
  }

  func textViewDidChange(_ textView: UITextView) {
    updatePlaceholder()
    emitValueChange()
    emitContentHeight()
  }

  func textView(
    _ textView: UITextView,
    shouldChangeTextIn range: NSRange,
    replacementText text: String
  ) -> Bool {
    if textView.markedTextRange != nil { return true }
    let nextLength = (textView.text as NSString).length - range.length + (text as NSString).length
    return nextLength <= maxLength
  }

  @available(iOS 16.0, *)
  public func textView(
    _ textView: UITextView,
    editMenuForTextIn range: NSRange,
    suggestedActions: [UIMenuElement]
  ) -> UIMenu? {
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
      title: "Форматирование",
      image: UIImage(systemName: "textformat"),
      children: formatActions
    )
    return UIMenu(children: suggestedActions + [formatMenu])
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
    var attributes = editor.typingAttributes
    attributes[.font] = UIFont.systemFont(ofSize: fontSize)
    attributes[.foregroundColor] = editorTextColor
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
        active = (attributes[.underlineStyle] as? NSNumber)?.intValue != 0
      case .strikethrough:
        active = (attributes[.strikethroughStyle] as? NSNumber)?.intValue != 0
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
      return (attributes[.underlineStyle] as? NSNumber)?.intValue != 0
    case .strikethrough:
      return (attributes[.strikethroughStyle] as? NSNumber)?.intValue != 0
    }
  }
}
