package com.bioblitz.microsurvival.ui

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import org.json.JSONObject

/**
 * Native Android UI Dialog for game settings and navigation.
 */
object NativeSettingsDialog {

    fun show(
        context: Context,
        currentSettingsJson: String,
        onSaveSettings: (String) -> Unit
    ) {
        val obj = runCatching { JSONObject(currentSettingsJson) }.getOrElse { JSONObject() }
        var graphicsQuality = obj.optString("graphicsQuality", "MEDIUM")
        var musicVol = (obj.optDouble("musicVolume", 0.55) * 100).toInt()
        var sfxVol = (obj.optDouble("sfxVolume", 0.75) * 100).toInt()
        var vibration = obj.optBoolean("vibrationEnabled", true)

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 36, 48, 24)
            setBackgroundColor(Color.parseColor("#18050E"))
        }

        val title = TextView(context).apply {
            text = "BIOBLITZ NATIVE SETTINGS"
            textSize = 18f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 0, 0, 24)
        }
        root.addView(title)

        val gfxLabel = TextView(context).apply {
            text = "Graphics Quality: $graphicsQuality"
            setTextColor(Color.parseColor("#38BDF8"))
        }
        root.addView(gfxLabel)

        val gfxRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 8, 0, 20)
        }
        listOf("LOW", "MEDIUM", "HIGH").forEach { mode ->
            val btn = Button(context).apply {
                text = mode
                setOnClickListener {
                    graphicsQuality = mode
                    gfxLabel.text = "Graphics Quality: $graphicsQuality"
                }
            }
            gfxRow.addView(btn)
        }
        root.addView(gfxRow)

        val musicLabel = TextView(context).apply {
            text = "Music Volume: $musicVol%"
            setTextColor(Color.WHITE)
        }
        root.addView(musicLabel)

        val musicSeek = SeekBar(context).apply {
            max = 100
            progress = musicVol
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    musicVol = progress
                    musicLabel.text = "Music Volume: $musicVol%"
                }
                override fun onStartTrackingTouch(seekBar: SeekBar?) {}
                override fun onStopTrackingTouch(seekBar: SeekBar?) {}
            })
        }
        root.addView(musicSeek)

        val sfxLabel = TextView(context).apply {
            text = "Sound Effects Volume: $sfxVol%"
            setTextColor(Color.WHITE)
            setPadding(0, 16, 0, 0)
        }
        root.addView(sfxLabel)

        val sfxSeek = SeekBar(context).apply {
            max = 100
            progress = sfxVol
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    sfxVol = progress
                    sfxLabel.text = "Sound Effects Volume: $sfxVol%"
                }
                override fun onStartTrackingTouch(seekBar: SeekBar?) {}
                override fun onStopTrackingTouch(seekBar: SeekBar?) {}
            })
        }
        root.addView(sfxSeek)

        val vibSwitch = Switch(context).apply {
            text = "Vibration Feedback"
            isChecked = vibration
            setTextColor(Color.WHITE)
            setPadding(0, 20, 0, 12)
            setOnCheckedChangeListener { _, isChecked -> vibration = isChecked }
        }
        root.addView(vibSwitch)

        AlertDialog.Builder(context)
            .setView(root)
            .setPositiveButton("Save") { dialog, _ ->
                obj.put("graphicsQuality", graphicsQuality)
                obj.put("musicVolume", musicVol / 100.0)
                obj.put("sfxVolume", sfxVol / 100.0)
                obj.put("vibrationEnabled", vibration)
                onSaveSettings(obj.toString())
                dialog.dismiss()
            }
            .setNegativeButton("Cancel") { dialog, _ -> dialog.dismiss() }
            .show()
    }
}
