package com.hanzihome.app

import android.app.Activity
import android.content.Intent
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.SamplerConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Runs Gemma on the phone with LiteRT-LM.
 *
 * The model (.litertlm) lives in the app's private storage. It can be downloaded
 * from Hugging Face inside the app or imported from a file the user already has.
 */
@CapacitorPlugin(name = "Gemma")
class GemmaPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val engineLock = Any()
    private var engine: Engine? = null
    private var engineBackend: String? = null
    @Volatile private var loading = false
    @Volatile private var downloadJob: Job? = null
    @Volatile private var lastError: String? = null

    private fun modelDir() = File(context.filesDir, "models").apply { mkdirs() }

    private fun modelFile(): File? =
        modelDir().listFiles()?.firstOrNull { it.isFile && it.name.endsWith(".litertlm") }

    // ------------------------------------------------------------------ status

    @PluginMethod
    fun status(call: PluginCall) {
        val f = modelFile()
        val ret = JSObject()
        ret.put("hasModel", f != null)
        ret.put("modelName", f?.name)
        ret.put("modelSize", f?.length() ?: 0L)
        ret.put("loaded", engine != null)
        ret.put("loading", loading)
        ret.put("backend", engineBackend)
        ret.put("downloading", downloadJob?.isActive == true)
        ret.put("freeBytes", modelDir().usableSpace)
        ret.put("lastError", lastError)
        call.resolve(ret)
    }

    // ------------------------------------------------------------------ download

    private fun open(url: String, token: String?, rangeFrom: Long = 0): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 20000
        conn.readTimeout = 60000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", "HanziHome/1.0")
        if (!token.isNullOrBlank()) conn.setRequestProperty("Authorization", "Bearer ${token.trim()}")
        if (rangeFrom > 0) conn.setRequestProperty("Range", "bytes=$rangeFrom-")
        return conn
    }

    /** Lists the .litertlm files in a Hugging Face repo, with sizes. */
    @PluginMethod
    fun listRemote(call: PluginCall) {
        val repo = call.getString("repo") ?: return call.reject("repo is required")
        val token = call.getString("token")
        scope.launch {
            try {
                val conn = open("https://huggingface.co/api/models/$repo/tree/main?recursive=true", token)
                val code = conn.responseCode
                if (code != 200) {
                    call.reject(httpMessage(code))
                    return@launch
                }
                val arr = JSONArray(conn.inputStream.bufferedReader().readText())
                val out = JSArray()
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val path = o.optString("path")
                    if (o.optString("type") != "file" || !path.endsWith(".litertlm")) continue
                    val size = o.optJSONObject("lfs")?.optLong("size") ?: o.optLong("size")
                    out.put(JSObject().put("path", path).put("size", size))
                }
                call.resolve(JSObject().put("files", out))
            } catch (e: Exception) {
                call.reject("Couldn't reach Hugging Face: ${e.message}")
            }
        }
    }

    private fun httpMessage(code: Int) = when (code) {
        401, 403 -> "Access denied ($code). Open the model page on huggingface.co, accept the licence, and paste an access token."
        404 -> "Not found (404). Check the repository name."
        else -> "Hugging Face returned HTTP $code"
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val repo = call.getString("repo") ?: return call.reject("repo is required")
        val path = call.getString("file") ?: return call.reject("file is required")
        val token = call.getString("token")
        if (downloadJob?.isActive == true) return call.reject("A download is already running")

        val name = path.substringAfterLast('/')
        val part = File(modelDir(), "$name.part")
        keepScreenOn(true)
        downloadJob = scope.launch {
            try {
                val from = if (part.exists()) part.length() else 0L
                val conn = open("https://huggingface.co/$repo/resolve/main/$path?download=true", token, from)
                val code = conn.responseCode
                if (code != 200 && code != 206) {
                    call.reject(httpMessage(code))
                    return@launch
                }
                val append = code == 206
                if (!append && part.exists()) part.delete()
                val start = if (append) from else 0L
                val total = start + conn.contentLengthLong.coerceAtLeast(0)
                if (total > 0 && total - start > modelDir().usableSpace) {
                    call.reject("Not enough free space: need ${(total - start) / 1_000_000} MB")
                    return@launch
                }
                conn.inputStream.use { input ->
                    java.io.FileOutputStream(part, append).use { output ->
                        copy(input, output, start, total, "downloadProgress")
                    }
                }
                if (!isActive) return@launch
                installModel(part, name)
                call.resolve(JSObject().put("modelName", name))
            } catch (e: Exception) {
                if (isActive) call.reject("Download failed: ${e.message}. Tap download again to resume.")
                else call.reject("Download cancelled")
            } finally {
                keepScreenOn(false)
            }
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        downloadJob?.cancel()
        call.resolve()
    }

    private suspend fun copy(input: InputStream, output: OutputStream, start: Long, total: Long, event: String) {
        val buf = ByteArray(1 shl 20)
        var received = start
        var lastEmit = 0L
        val job = kotlin.coroutines.coroutineContext[Job]
        while (job?.isActive != false) {
            val n = input.read(buf)
            if (n < 0) break
            output.write(buf, 0, n)
            received += n
            val now = System.currentTimeMillis()
            if (now - lastEmit > 400) {
                lastEmit = now
                notifyListeners(event, JSObject().put("received", received).put("total", total))
            }
        }
        notifyListeners(event, JSObject().put("received", received).put("total", total))
    }

    private fun installModel(tmp: File, name: String) {
        unloadEngine()
        modelDir().listFiles()?.forEach { if (it.name.endsWith(".litertlm")) it.delete() }
        val target = File(modelDir(), name)
        if (!tmp.renameTo(target)) {
            tmp.copyTo(target, overwrite = true)
            tmp.delete()
        }
    }

    private fun keepScreenOn(on: Boolean) {
        activity?.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ------------------------------------------------------------------ import from storage

    @PluginMethod
    fun importFile(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        startActivityForResult(call, intent, "onPicked")
    }

    @ActivityCallback
    fun onPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) return call.reject("No file chosen")
        var name = "model.litertlm"
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) name = c.getString(idx)
        }
        if (!name.endsWith(".litertlm")) return call.reject("Please choose a .litertlm file (got $name)")
        val total = context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: 0L
        keepScreenOn(true)
        scope.launch {
            val part = File(modelDir(), "$name.part")
            try {
                context.contentResolver.openInputStream(uri)!!.use { input ->
                    part.outputStream().use { output -> copy(input, output, 0, total, "importProgress") }
                }
                installModel(part, name)
                call.resolve(JSObject().put("modelName", name))
            } catch (e: Exception) {
                part.delete()
                call.reject("Import failed: ${e.message}")
            } finally {
                keepScreenOn(false)
            }
        }
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        downloadJob?.cancel()
        unloadEngine()
        modelDir().listFiles()?.forEach { it.delete() }
        call.resolve()
    }

    // ------------------------------------------------------------------ inference

    private fun ensureEngine(backend: String): Engine {
        synchronized(engineLock) {
            engine?.let { if (engineBackend == backend) return it }
            unloadEngine()
            val f = modelFile() ?: throw IllegalStateException("No Gemma model on this phone yet. Download one in Settings.")
            loading = true
            try {
                val config = EngineConfig(
                    modelPath = f.absolutePath,
                    backend = if (backend == "gpu") Backend.GPU() else Backend.CPU(),
                    cacheDir = context.cacheDir.path,
                )
                val e = Engine(config)
                e.initialize()
                engine = e
                engineBackend = backend
                lastError = null
                return e
            } catch (t: Throwable) {
                lastError = t.message
                throw t
            } finally {
                loading = false
            }
        }
    }

    private fun unloadEngine() {
        synchronized(engineLock) {
            try { engine?.close() } catch (_: Throwable) {}
            engine = null
            engineBackend = null
        }
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val backend = call.getString("backend") ?: "cpu"
        scope.launch {
            try {
                ensureEngine(backend)
                call.resolve(JSObject().put("loaded", true).put("backend", backend))
            } catch (t: Throwable) {
                call.reject("Couldn't load the model: ${t.message}")
            }
        }
    }

    @PluginMethod
    fun unload(call: PluginCall) {
        unloadEngine()
        call.resolve()
    }

    /** One-shot generation: a fresh conversation per request, so nothing leaks between prompts. */
    @PluginMethod
    fun generate(call: PluginCall) {
        val prompt = call.getString("prompt") ?: return call.reject("prompt is required")
        val system = call.getString("system") ?: ""
        val temperature = call.getDouble("temperature") ?: 0.7
        val backend = call.getString("backend") ?: "cpu"
        scope.launch {
            try {
                val e = ensureEngine(backend)
                val text = synchronized(engineLock) {
                    val config = ConversationConfig(
                        systemInstruction = Contents.of(system),
                        samplerConfig = SamplerConfig(topK = 40, topP = 0.95, temperature = temperature),
                    )
                    e.createConversation(config).use { conv -> conv.sendMessage(prompt).toString() }
                }
                call.resolve(JSObject().put("text", text))
            } catch (t: Throwable) {
                lastError = t.message
                call.reject("Gemma failed: ${t.message}")
            }
        }
    }

    override fun handleOnDestroy() {
        downloadJob?.cancel()
        unloadEngine()
        super.handleOnDestroy()
    }
}
