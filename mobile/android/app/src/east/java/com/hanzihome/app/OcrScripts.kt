package com.hanzihome.app

import com.google.mlkit.vision.text.TextRecognizerOptionsInterface
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/** East edition: Chinese, Japanese and Latin text recognition. */
fun ocrOptions(script: String): TextRecognizerOptionsInterface = when (script) {
    "zh" -> ChineseTextRecognizerOptions.Builder().build()
    "ja" -> JapaneseTextRecognizerOptions.Builder().build()
    else -> TextRecognizerOptions.DEFAULT_OPTIONS
}
