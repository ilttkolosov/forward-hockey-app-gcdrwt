package com.forwardhockey.richtext

import android.graphics.Color
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ForwardRichTextInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ForwardRichTextInput")

    // Feature probes keep OTA/old-binary combinations safe: JavaScript only
    // sends the new view event prop when the installed native module declares
    // support, and normalizes legacy pixel-based content heights otherwise.
    Constant("keyboardGeometryVersion") { 2 }
    Constant("contentSizeUnitVersion") { 1 }

    View(ForwardRichTextInputView::class) {
      Events(
        "onValueChange",
        "onFocus",
        "onBlur",
        "onContentSizeChange",
        "onKeyboardGeometryChange",
        "onPasteAttachment"
      )

      Prop("value") { view: ForwardRichTextInputView, value: String? ->
        view.setEncodedValue(value.orEmpty())
      }

      Prop("placeholder") { view: ForwardRichTextInputView, value: String? ->
        view.setPlaceholder(value.orEmpty())
      }

      Prop("maxLength") { view: ForwardRichTextInputView, value: Int? ->
        view.setMaximumLength(value ?: 4000)
      }

      Prop("editable") { view: ForwardRichTextInputView, value: Boolean? ->
        view.setEditable(value ?: true)
      }

      Prop("pasteAttachmentsEnabled") { view: ForwardRichTextInputView, value: Boolean? ->
        view.setPasteAttachmentsEnabled(value ?: false)
      }

      Prop("fontSize") { view: ForwardRichTextInputView, value: Double? ->
        view.setEditorFontSize((value ?: 16.0).toFloat())
      }

      Prop("textColor") { view: ForwardRichTextInputView, value: Int? ->
        view.setEditorTextColor(value ?: Color.rgb(31, 51, 71))
      }

      Prop("placeholderTextColor") { view: ForwardRichTextInputView, value: Int? ->
        view.setEditorHintColor(value ?: Color.rgb(138, 150, 156))
      }

      Prop("selectionColor") { view: ForwardRichTextInputView, value: Int? ->
        view.setSelectionColor(value ?: Color.rgb(47, 128, 237))
      }

      AsyncFunction("focusEditor") { view: ForwardRichTextInputView ->
        view.focusEditor()
      }

      AsyncFunction("blurEditor") { view: ForwardRichTextInputView ->
        view.blurEditor()
      }
    }
  }
}
