package com.hanzihome.app

import com.google.mlkit.vision.text.TextRecognizerOptionsInterface
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/** Heritage edition: Latin-script text recognition only (no CJK ML Kit libraries). */
fun ocrOptions(@Suppress("UNUSED_PARAMETER") script: String): TextRecognizerOptionsInterface =
    TextRecognizerOptions.DEFAULT_OPTIONS
