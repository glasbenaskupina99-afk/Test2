package com.hanzihome.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.LocalDate

/**
 * Home-screen widget: a word of the day from the words you've learned, how many reviews are
 * due and your streak. The app hands it a small list of words and review times (WidgetPlugin),
 * so it stays current for days even when the app isn't opened.
 */
class BloomkoWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, views(context))
    }

    companion object {
        const val PREFS = "bloomko_widget"

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, BloomkoWidget::class.java))
            for (id in ids) manager.updateAppWidget(id, views(context))
        }

        private fun views(context: Context): RemoteViews {
            val v = RemoteViews(context.packageName, R.layout.widget_bloomko)
            val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            v.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            )
            val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null)
            val data = try { raw?.let { JSONObject(it) } } catch (_: Throwable) { null }
            val words = data?.optJSONArray("words")
            if (data == null || words == null || words.length() == 0) {
                v.setTextViewText(R.id.widget_word, "🌱")
                v.setTextViewText(R.id.widget_reading, "")
                v.setTextViewText(R.id.widget_meaning, "Open Bloomko to start learning")
                v.setTextViewText(R.id.widget_due, "")
                v.setViewVisibility(R.id.widget_streak, View.GONE)
                return v
            }
            val today = LocalDate.now()
            val w = words.getJSONObject((today.toEpochDay() % words.length()).toInt())
            v.setTextViewText(R.id.widget_label, data.optString("label", "Word of the day"))
            v.setTextViewText(R.id.widget_word, w.optString("w"))
            v.setTextViewText(R.id.widget_reading, w.optString("r"))
            v.setTextViewText(R.id.widget_meaning, w.optString("m"))

            val now = System.currentTimeMillis()
            val times = data.optJSONArray("due")
            var due = 0
            if (times != null) for (i in 0 until times.length()) if (times.optLong(i) <= now) due++
            v.setTextViewText(R.id.widget_due, if (due > 0) "🔁 $due ${if (due == 1) "review" else "reviews"} waiting" else "✓ All caught up")

            // The streak only counts if you practised today or yesterday.
            val last = data.optString("last_day", "")
            val streak = data.optInt("streak", 0)
            val alive = last == today.toString() || last == today.minusDays(1).toString()
            if (streak > 0 && alive) {
                v.setViewVisibility(R.id.widget_streak, View.VISIBLE)
                v.setTextViewText(R.id.widget_streak, "🌿 $streak")
            } else {
                v.setViewVisibility(R.id.widget_streak, View.GONE)
            }
            return v
        }
    }
}
