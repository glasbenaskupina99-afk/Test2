package com.hanzihome.app

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Receives the widget's data from the app (as JSON) and redraws the home-screen widget. */
@CapacitorPlugin(name = "Widget")
class WidgetPlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val json = call.getString("json") ?: return call.reject("json is required")
        context.getSharedPreferences(BloomkoWidget.PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply()
        BloomkoWidget.refresh(context)
        call.resolve()
    }
}
