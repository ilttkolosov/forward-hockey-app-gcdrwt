package com.forwardhockey.richtext

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipDescription
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.os.Build
import android.net.Uri
import android.provider.OpenableColumns
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.TextWatcher
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.view.ActionMode
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputContentInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import java.io.File
import java.util.ArrayDeque
import java.util.UUID

private tailrec fun Context.findActivity(): Activity? = when (this) {
  is Activity -> this
  is ContextWrapper -> baseContext.findActivity()
  else -> null
}

private class ForwardRichEditText(context: Context) : EditText(context) {
  var richContentEnabled = false
  var onRichContent: ((InputContentInfo, Int) -> Boolean)? = null

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
    val connection = super.onCreateInputConnection(outAttrs) ?: return null
    if (!richContentEnabled || Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
      return connection
    }
    outAttrs.contentMimeTypes = arrayOf("image/*")
    return object : InputConnectionWrapper(connection, false) {
      override fun commitContent(
        inputContentInfo: InputContentInfo,
        flags: Int,
        opts: android.os.Bundle?
      ): Boolean {
        if (onRichContent?.invoke(inputContentInfo, flags) == true) return true
        return super.commitContent(inputContentInfo, flags, opts)
      }
    }
  }
}

private enum class ForwardTextFormat(val token: String, val title: String) {
  BOLD("\u2063\u2063", "Жирный"),
  ITALIC("\u2062\u2062", "Курсив"),
  UNDERLINE("\u2061\u2061", "Подчёркнутый"),
  STRIKETHROUGH("\u2060\u2060", "Зачёркнутый")
}

private data class FormatState(
  val bold: BooleanArray,
  val italic: BooleanArray,
  val underline: BooleanArray,
  val strikethrough: BooleanArray
) {
  fun values(format: ForwardTextFormat): BooleanArray = when (format) {
    ForwardTextFormat.BOLD -> bold
    ForwardTextFormat.ITALIC -> italic
    ForwardTextFormat.UNDERLINE -> underline
    ForwardTextFormat.STRIKETHROUGH -> strikethrough
  }
}

@SuppressLint("ViewConstructor")
class ForwardRichTextInputView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  val onValueChange by EventDispatcher<Map<String, Any>>()
  val onFocus by EventDispatcher<Unit>()
  val onBlur by EventDispatcher<Unit>()
  val onContentSizeChange by EventDispatcher<Map<String, Any>>()
  val onKeyboardGeometryChange by EventDispatcher<Map<String, Any>>()
  val onPasteAttachment by EventDispatcher<Map<String, Any>>()

  private val editor = ForwardRichEditText(context)
  private var suppressEvents = false
  private var maximumLength = 4000
  private var lastContentHeight = -1
  private val recentlyEmittedEncodedValues = ArrayDeque<String>()
  private val keyboardVisibleFrame = Rect()
  private val keyboardRootLocation = IntArray(2)
  private var keyboardObserverRoot: View? = null
  private var lastKeyboardGeometrySignature: String? = null
  private val keyboardLayoutListener =
    ViewTreeObserver.OnGlobalLayoutListener { emitKeyboardGeometry() }

  private fun enforceImeResize() {
    val window = context.findActivity()?.window ?: return
    val currentMode = window.attributes.softInputMode
    val nextMode =
      (currentMode and WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST.inv()) or
        WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    if (nextMode != currentMode) window.setSoftInputMode(nextMode)
  }

  private fun startKeyboardGeometryObservation() {
    val root = rootView
    if (keyboardObserverRoot !== root) {
      stopKeyboardGeometryObservation(emitHidden = false)
      keyboardObserverRoot = root
      if (root.viewTreeObserver.isAlive) {
        root.viewTreeObserver.addOnGlobalLayoutListener(keyboardLayoutListener)
      }
    }
    for (delay in longArrayOf(0L, 80L, 180L, 320L, 520L, 850L)) {
      root.postDelayed({
        if (editor.hasFocus()) emitKeyboardGeometry()
      }, delay)
    }
  }

  private fun stopKeyboardGeometryObservation(emitHidden: Boolean = true) {
    val root = keyboardObserverRoot
    if (root != null && root.viewTreeObserver.isAlive) {
      root.viewTreeObserver.removeOnGlobalLayoutListener(keyboardLayoutListener)
    }
    keyboardObserverRoot = null
    if (emitHidden) emitKeyboardGeometry(forceHidden = true)
  }

  private fun emitKeyboardGeometry(forceHidden: Boolean = false) {
    val root = rootView
    if (root.height <= 0) return

    var frameworkImeInset = 0
    var frameworkImeVisible = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      root.rootWindowInsets?.let { insets ->
        frameworkImeInset = insets.getInsets(WindowInsets.Type.ime()).bottom
        frameworkImeVisible = insets.isVisible(WindowInsets.Type.ime())
      }
    }

    root.getWindowVisibleDisplayFrame(keyboardVisibleFrame)
    root.getLocationOnScreen(keyboardRootLocation)
    val rootBottomOnScreen = keyboardRootLocation[1] + root.height
    val visibleFrameInset =
      (rootBottomOnScreen - keyboardVisibleFrame.bottom).coerceAtLeast(0)
    val effectiveImeInset = max(frameworkImeInset, visibleFrameInset)
    val visible =
      !forceHidden && editor.hasFocus() &&
        ((frameworkImeVisible && frameworkImeInset > 0) ||
          visibleFrameInset >= dp(80))
    val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    fun toDp(value: Int): Int =
      if (value <= 0) 0
      else ceil(value.toDouble() / density.toDouble()).toInt()

    val effectiveDp = toDp(if (visible) effectiveImeInset else 0)
    val frameworkDp = toDp(frameworkImeInset)
    val visibleFrameDp = toDp(visibleFrameInset)
    val signature = "$visible:$effectiveDp:$frameworkDp:$visibleFrameDp"
    if (signature == lastKeyboardGeometrySignature) return
    lastKeyboardGeometrySignature = signature
    onKeyboardGeometryChange(
      mapOf(
        "visible" to visible,
        "imeHeight" to effectiveDp.toDouble(),
        "frameworkImeHeight" to frameworkDp.toDouble(),
        "visibleFrameInset" to visibleFrameDp.toDouble()
      )
    )
  }

  private val formatMenuIds = mapOf(
    ForwardTextFormat.BOLD to 0x464F0101,
    ForwardTextFormat.ITALIC to 0x464F0102,
    ForwardTextFormat.UNDERLINE to 0x464F0103,
    ForwardTextFormat.STRIKETHROUGH to 0x464F0104
  )

  private val selectionActionModeCallback = object : ActionMode.Callback {
    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
      addFormattingMenu(menu)
      return true
    }

    override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
      updateFormattingMenuState(menu)
      return true
    }

    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
      val format = formatMenuIds.entries.firstOrNull { it.value == item.itemId }?.key
        ?: return false
      toggleFormat(format)
      mode.finish()
      return true
    }

    override fun onDestroyActionMode(mode: ActionMode) = Unit
  }

  init {
    clipChildren = true
    editor.layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    )
    editor.setBackgroundColor(Color.TRANSPARENT)
    editor.setPadding(dp(14), dp(9), dp(14), dp(9))
    editor.gravity = Gravity.TOP or Gravity.START
    editor.includeFontPadding = false
    editor.isSingleLine = false
    editor.setHorizontallyScrolling(false)
    editor.inputType = InputType.TYPE_CLASS_TEXT or
      InputType.TYPE_TEXT_FLAG_MULTI_LINE or
      InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or
      InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
    editor.textSize = 16f
    editor.setTextColor(Color.rgb(31, 51, 71))
    editor.setHintTextColor(Color.rgb(138, 150, 156))
    editor.highlightColor = Color.argb(88, 47, 128, 237)
    editor.setCustomSelectionActionModeCallback(selectionActionModeCallback)
    editor.onRichContent = ::acceptRichContent
    editor.setOnFocusChangeListener { _, hasFocus ->
      if (hasFocus) {
        enforceImeResize()
        startKeyboardGeometryObservation()
        onFocus(Unit)
      } else {
        stopKeyboardGeometryObservation()
        onBlur(Unit)
      }
    }
    editor.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit

      override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) = Unit

      override fun afterTextChanged(value: Editable?) {
        if (!suppressEvents) {
          emitEncodedValueChange()
        }
        emitContentHeight()
      }
    })
    editor.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> emitContentHeight() }
    setMaximumLength(maximumLength)
    addView(editor)
  }

  fun setEncodedValue(value: String) {
    // Native input can run ahead of React during rapid IME operations such as
    // long-press Backspace. React may then deliver several older values after
    // the EditText has already advanced. Any value recently emitted by this
    // editor is an echo and must never replace the live Editable/composing
    // state, even when it arrives out of order.
    if (consumeRecentNativeEcho(value)) return

    // Programmatic callers can also provide a value that is already visible.
    // This slower comparison is intentionally outside the keystroke echo path.
    if (encodeAttributedText() == value) return

    suppressEvents = true
    editor.setText(decodeAttributedText(value), TextView.BufferType.SPANNABLE)
    editor.setSelection(editor.text.length)
    suppressEvents = false
    clearRecentNativeEchoes()
    emitContentHeight()
  }

  fun setPlaceholder(value: String) {
    editor.hint = value
  }

  fun setMaximumLength(value: Int) {
    maximumLength = max(0, value)
    editor.filters = arrayOf(InputFilter.LengthFilter(maximumLength))
  }

  fun setEditable(value: Boolean) {
    editor.isEnabled = value
    editor.isFocusable = value
    editor.isFocusableInTouchMode = value
    editor.isCursorVisible = value
  }

  fun setPasteAttachmentsEnabled(value: Boolean) {
    if (editor.richContentEnabled == value) return
    editor.richContentEnabled = value
    editor.restartInputConnection()
  }

  fun setEditorFontSize(value: Float) {
    editor.textSize = value
    emitContentHeight()
  }

  fun setEditorTextColor(value: Int) {
    editor.setTextColor(value)
  }

  fun setEditorHintColor(value: Int) {
    editor.setHintTextColor(value)
  }

  fun setSelectionColor(value: Int) {
    editor.highlightColor = value and 0x00FFFFFF or 0x58000000
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      editor.textCursorDrawable?.setTint(value)
      editor.textSelectHandle?.setTint(value)
      editor.textSelectHandleLeft?.setTint(value)
      editor.textSelectHandleRight?.setTint(value)
    }
  }

  fun focusEditor() {
    editor.post {
      enforceImeResize()
      editor.requestFocus()
      val inputMethod = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
      inputMethod?.showSoftInput(editor, InputMethodManager.SHOW_IMPLICIT)
    }
  }

  fun blurEditor() {
    editor.clearFocus()
    val inputMethod = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    inputMethod?.hideSoftInputFromWindow(editor.windowToken, 0)
  }

  override fun onDetachedFromWindow() {
    stopKeyboardGeometryObservation(emitHidden = false)
    super.onDetachedFromWindow()
  }

  private fun acceptRichContent(content: InputContentInfo, flags: Int): Boolean {
    if (!editor.richContentEnabled || Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
      return false
    }
    val description = content.description
    val mimeType = preferredImageMimeType(description) ?: return false
    val permissionRequested =
      flags and InputConnection.INPUT_CONTENT_GRANT_READ_URI_PERMISSION != 0
    if (permissionRequested) {
      try {
        content.requestPermission()
      } catch (_: SecurityException) {
        onPasteAttachment(mapOf("error" to "Не удалось получить доступ к стикеру"))
        return true
      }
    }
    val uri = content.contentUri
    Thread {
      try {
        val resolver = context.contentResolver
        val metadata = queryContentMetadata(uri)
        val extension = extensionForMimeType(mimeType)
        val directory = File(context.cacheDir, "forward-rich-content")
        if (!directory.exists() && !directory.mkdirs()) {
          throw IllegalStateException("Could not create rich content cache")
        }
        val target = File(directory, "sticker-${UUID.randomUUID()}.$extension")
        val input = resolver.openInputStream(uri)
          ?: throw IllegalStateException("Could not open rich content")
        input.use { source ->
          target.outputStream().use { output -> source.copyTo(output) }
        }
        val displayName = metadata.first?.takeIf { it.isNotBlank() }
          ?: "sticker-${System.currentTimeMillis()}.$extension"
        val sizeBytes = target.length().takeIf { it > 0 } ?: metadata.second
        post {
          val payload = mutableMapOf<String, Any>(
            "kind" to "image",
            "uri" to Uri.fromFile(target).toString(),
            "name" to displayName,
            "mimeType" to mimeType
          )
          if (sizeBytes != null && sizeBytes >= 0) payload["sizeBytes"] = sizeBytes.toDouble()
          onPasteAttachment(payload)
        }
      } catch (_: Exception) {
        post {
          onPasteAttachment(mapOf("error" to "Не удалось вставить стикер или изображение"))
        }
      } finally {
        if (permissionRequested) {
          try {
            content.releasePermission()
          } catch (_: Exception) {
            // Some keyboards grant a process-scoped URI that needs no release.
          }
        }
      }
    }.start()
    return true
  }

  private fun preferredImageMimeType(description: ClipDescription): String? {
    for (index in 0 until description.mimeTypeCount) {
      val value = description.getMimeType(index)
      if (value.startsWith("image/")) return value
    }
    return null
  }

  private fun extensionForMimeType(mimeType: String): String = when (mimeType.lowercase()) {
    "image/gif" -> "gif"
    "image/webp" -> "webp"
    "image/heic", "image/heif" -> "heic"
    "image/jpeg" -> "jpg"
    else -> "png"
  }

  private fun queryContentMetadata(uri: Uri): Pair<String?, Long?> {
    var name: String? = null
    var size: Long? = null
    context.contentResolver.query(
      uri,
      arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
      null,
      null,
      null
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
      }
    }
    return name to size
  }

  private fun EditText.restartInputConnection() {
    val inputMethod = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    inputMethod?.restartInput(this)
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    emitContentHeight()
  }

  private fun addFormattingMenu(menu: Menu) {
    val submenu = menu.addSubMenu(Menu.NONE, FORMAT_MENU_ID, 90, "Форматирование")
    ForwardTextFormat.entries.forEachIndexed { index, format ->
      submenu.add(Menu.NONE, formatMenuIds.getValue(format), index, format.title)
        .setCheckable(true)
    }
    updateFormattingMenuState(menu)
  }

  private fun updateFormattingMenuState(menu: Menu) {
    val start = min(editor.selectionStart, editor.selectionEnd).coerceAtLeast(0)
    val end = max(editor.selectionStart, editor.selectionEnd).coerceAtMost(editor.text.length)
    ForwardTextFormat.entries.forEach { format ->
      menu.findItem(formatMenuIds.getValue(format))?.isChecked =
        start < end && isFormatApplied(format, start, end)
    }
  }

  private fun toggleFormat(format: ForwardTextFormat) {
    val start = min(editor.selectionStart, editor.selectionEnd).coerceAtLeast(0)
    val end = max(editor.selectionStart, editor.selectionEnd).coerceAtMost(editor.text.length)
    if (start >= end) return

    val value = editor.text
    val state = captureFormatState(value)
    val target = state.values(format)
    val remove = (start until end).all { target[it] }
    for (index in start until end) target[index] = !remove
    rebuildFormattingSpans(value, state)
    editor.setSelection(start, end)
    editor.requestFocus()
    emitEncodedValueChange()
    emitContentHeight()
  }

  private fun isFormatApplied(format: ForwardTextFormat, start: Int, end: Int): Boolean {
    if (start >= end) return false
    val state = captureFormatState(editor.text).values(format)
    return (start until end).all { state[it] }
  }

  private fun captureFormatState(value: Spannable): FormatState {
    val length = value.length
    val state = FormatState(
      BooleanArray(length),
      BooleanArray(length),
      BooleanArray(length),
      BooleanArray(length)
    )

    value.getSpans(0, length, StyleSpan::class.java).forEach { span ->
      if (isImeComposingSpan(value, span)) return@forEach
      val start = value.getSpanStart(span).coerceIn(0, length)
      val end = value.getSpanEnd(span).coerceIn(start, length)
      val isBold = span.style == Typeface.BOLD || span.style == Typeface.BOLD_ITALIC
      val isItalic = span.style == Typeface.ITALIC || span.style == Typeface.BOLD_ITALIC
      for (index in start until end) {
        if (isBold) state.bold[index] = true
        if (isItalic) state.italic[index] = true
      }
    }
    value.getSpans(0, length, UnderlineSpan::class.java).forEach { span ->
      markRange(value, span, state.underline)
    }
    value.getSpans(0, length, StrikethroughSpan::class.java).forEach { span ->
      markRange(value, span, state.strikethrough)
    }
    return state
  }

  private fun markRange(value: Spannable, span: Any, target: BooleanArray) {
    if (isImeComposingSpan(value, span)) return
    val start = value.getSpanStart(span).coerceIn(0, target.size)
    val end = value.getSpanEnd(span).coerceIn(start, target.size)
    for (index in start until end) target[index] = true
  }

  private fun isImeComposingSpan(value: Spannable, span: Any): Boolean =
    value.getSpanFlags(span) and Spannable.SPAN_COMPOSING != 0

  private fun rebuildFormattingSpans(value: Spannable, state: FormatState) {
    value.getSpans(0, value.length, StyleSpan::class.java).forEach(value::removeSpan)
    value.getSpans(0, value.length, UnderlineSpan::class.java).forEach(value::removeSpan)
    value.getSpans(0, value.length, StrikethroughSpan::class.java).forEach(value::removeSpan)

    applyRanges(value, state.bold) { StyleSpan(Typeface.BOLD) }
    applyRanges(value, state.italic) { StyleSpan(Typeface.ITALIC) }
    applyRanges(value, state.underline) { UnderlineSpan() }
    applyRanges(value, state.strikethrough) { StrikethroughSpan() }
  }

  private fun applyRanges(value: Spannable, active: BooleanArray, spanFactory: () -> Any) {
    var start: Int? = null
    for (index in 0..active.size) {
      val isActive = index < active.size && active[index]
      if (isActive && start == null) {
        start = index
      } else if (!isActive && start != null) {
        value.setSpan(spanFactory(), start, index, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        start = null
      }
    }
  }

  private fun decodeAttributedText(encoded: String): SpannableStringBuilder {
    val plain = StringBuilder()
    val active = mutableMapOf<ForwardTextFormat, Int>()
    val ranges = mutableListOf<Pair<ForwardTextFormat, IntRange>>()
    var cursor = 0

    while (cursor < encoded.length) {
      val format = ForwardTextFormat.entries.firstOrNull { encoded.startsWith(it.token, cursor) }
      if (format == null) {
        plain.append(encoded[cursor])
        cursor += 1
        continue
      }

      val start = active.remove(format)
      if (start != null) {
        if (plain.length > start) ranges += format to (start until plain.length)
      } else if (hasMeaningfulClosingToken(encoded, format, cursor)) {
        active[format] = plain.length
      } else {
        plain.append(format.token)
      }
      cursor += format.token.length
    }

    val result = SpannableStringBuilder(plain.toString())
    ranges.forEach { (format, range) ->
      if (range.isEmpty()) return@forEach
      val span = when (format) {
        ForwardTextFormat.BOLD -> StyleSpan(Typeface.BOLD)
        ForwardTextFormat.ITALIC -> StyleSpan(Typeface.ITALIC)
        ForwardTextFormat.UNDERLINE -> UnderlineSpan()
        ForwardTextFormat.STRIKETHROUGH -> StrikethroughSpan()
      }
      result.setSpan(span, range.first, range.last + 1, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    return result
  }

  private fun hasMeaningfulClosingToken(
    value: String,
    format: ForwardTextFormat,
    cursor: Int
  ): Boolean {
    val contentStart = cursor + format.token.length
    val closing = value.indexOf(format.token, contentStart)
    return closing >= 0 && value.substring(contentStart, closing).isNotBlank()
  }

  private fun emitEncodedValueChange() {
    val encoded = encodeAttributedText()
    rememberNativeEmission(encoded)
    onValueChange(mapOf("value" to encoded))
  }

  private fun rememberNativeEmission(value: String) {
    recentlyEmittedEncodedValues.addLast(value)
    while (recentlyEmittedEncodedValues.size > MAX_RECENT_NATIVE_ECHOES) {
      recentlyEmittedEncodedValues.removeFirst()
    }
  }

  private fun consumeRecentNativeEcho(value: String): Boolean {
    val iterator = recentlyEmittedEncodedValues.iterator()
    while (iterator.hasNext()) {
      if (iterator.next() == value) {
        iterator.remove()
        return true
      }
    }
    return false
  }

  private fun clearRecentNativeEchoes() {
    recentlyEmittedEncodedValues.clear()
  }

  private fun encodeAttributedText(): String {
    val visible = editor.text.toString()
    if (visible.isEmpty()) return ""

    // Plain typing is by far the hottest path. Avoid allocating four
    // BooleanArrays and walking the full string when the user has not applied
    // any Forward formatting at all.
    if (!hasSupportedFormatting(editor.text)) return visible

    val state = captureFormatState(editor.text)
    val result = StringBuilder(visible.length + 32)

    for (index in 0..visible.length) {
      ForwardTextFormat.entries.reversed().forEach { format ->
        val values = state.values(format)
        if (index > 0 && values[index - 1] && (index == visible.length || !values[index])) {
          result.append(format.token)
        }
      }
      ForwardTextFormat.entries.forEach { format ->
        val values = state.values(format)
        if (index < visible.length && values[index] && (index == 0 || !values[index - 1])) {
          result.append(format.token)
        }
      }
      if (index < visible.length) result.append(visible[index])
    }
    return result.toString()
  }

  private fun hasSupportedFormatting(value: Spannable): Boolean {
    if (value.getSpans(0, value.length, StyleSpan::class.java)
        .any { !isImeComposingSpan(value, it) }) return true
    if (value.getSpans(0, value.length, UnderlineSpan::class.java)
        .any { !isImeComposingSpan(value, it) }) return true
    return value.getSpans(0, value.length, StrikethroughSpan::class.java)
      .any { !isImeComposingSpan(value, it) }
  }

  private fun emitContentHeight() {
    editor.post {
      val textLayout = editor.layout
      val textHeight = if (textLayout != null && textLayout.lineCount > 0) {
        textLayout.getLineBottom(textLayout.lineCount - 1)
      } else {
        ceil(editor.textSize * 1.25).toInt()
      }
      val height = textHeight + editor.compoundPaddingTop + editor.compoundPaddingBottom
      if (height != lastContentHeight) {
        lastContentHeight = height
        val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
        val heightDp = ceil(height.toDouble() / density.toDouble())
        onContentSizeChange(mapOf("height" to heightDp))
      }
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val FORMAT_MENU_ID = 0x464F0100
    private const val MAX_RECENT_NATIVE_ECHOES = 96
  }
}
