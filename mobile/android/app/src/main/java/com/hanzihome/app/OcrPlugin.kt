package com.hanzihome.app

import android.graphics.BitmapFactory
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/** Reads the text in a photo on the phone (ML Kit): Chinese, Japanese or Latin script. */
@CapacitorPlugin(name = "Ocr")
class OcrPlugin : Plugin() {
    @PluginMethod
    fun recognize(call: PluginCall) {
        val b64 = call.getString("image") ?: return call.reject("image is required")
        val bytes = try { Base64.decode(b64, Base64.DEFAULT) } catch (_: Throwable) { return call.reject("That isn't an image") }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return call.reject("Couldn't open the photo")
        val recognizer = when (call.getString("script") ?: "latin") {
            "zh" -> TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
            "ja" -> TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
            else -> TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        }
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { result ->
                val lines = JSArray()
                for (block in result.textBlocks) for (line in block.lines) lines.put(line.text)
                call.resolve(JSObject().put("text", result.text).put("lines", lines))
                recognizer.close()
            }
            .addOnFailureListener { e ->
                val msg = e.message ?: "unknown error"
                call.reject(
                    if (msg.contains("download", ignoreCase = true)) "The text-recognition model is still downloading — try again in a minute."
                    else "Couldn't read the photo: $msg"
                )
                recognizer.close()
            }
    }
}
