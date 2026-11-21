package com.hanzihome.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(GemmaPlugin::class.java)
        registerPlugin(WidgetPlugin::class.java)
        registerPlugin(OcrPlugin::class.java)
        super.onCreate(savedInstanceState)
        // Allow bundled voice clips to play automatically in exercises and story playback loops.
        bridge?.webView?.settings?.mediaPlaybackRequiresUserGesture = false
    }
}
