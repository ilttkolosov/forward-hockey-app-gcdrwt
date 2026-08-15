import ExpoModulesCore
import UIKit

public final class ForwardRichTextInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ForwardRichTextInput")

    View(ForwardRichTextInputView.self) {
      Events(
        "onValueChange",
        "onFocus",
        "onBlur",
        "onContentSizeChange",
        "onPasteAttachment"
      )

      Prop("value") { (view, value: String?) in
        view.setEncodedValue(value ?? "")
      }

      Prop("placeholder") { (view, value: String?) in
        view.placeholder = value ?? ""
      }

      Prop("maxLength") { (view, value: Int?) in
        view.maxLength = value ?? 4000
      }

      Prop("editable") { (view, value: Bool?) in
        view.isEditable = value ?? true
      }

      Prop("pasteAttachmentsEnabled") { (view, value: Bool?) in
        view.pasteAttachmentsEnabled = value ?? false
      }

      Prop("fontSize") { (view, value: Double?) in
        view.fontSize = CGFloat(value ?? 16)
      }

      Prop("textColor") { (view, value: UIColor?) in
        view.editorTextColor = value ?? UIColor.label
      }

      Prop("placeholderTextColor") { (view, value: UIColor?) in
        view.placeholderTextColor = value ?? UIColor.placeholderText
      }

      Prop("selectionColor") { (view, value: UIColor?) in
        view.selectionColor = value ?? UIColor.systemBlue
      }

      AsyncFunction("focusEditor") { (view: ForwardRichTextInputView) in
        view.focusEditor()
      }

      AsyncFunction("blurEditor") { (view: ForwardRichTextInputView) in
        view.blurEditor()
      }
    }
  }
}
