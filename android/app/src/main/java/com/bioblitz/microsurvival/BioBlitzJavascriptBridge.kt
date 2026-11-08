package com.bioblitz.microsurvival

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import com.bioblitz.microsurvival.data.BioBlitzDao
import com.bioblitz.microsurvival.data.PlayerSettingsEntity
import com.bioblitz.microsurvival.data.RunRecordEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject

class BioBlitzJavascriptBridge(
    private val context: Context,
    private val dao: BioBlitzDao
) {
    private val ioScope = CoroutineScope(Dispatchers.IO)

    @JavascriptInterface
    fun saveRunResult(jsonPayload: String) {
        ioScope.launch {
            runCatching {
                val obj = JSONObject(jsonPayload)
                val entity = RunRecordEntity(
                    timestamp = obj.optLong("timestamp", System.currentTimeMillis()),
                    score = obj.optInt("score", 0),
                    survivalTimeSec = obj.optDouble("survivalTimeSec", 0.0).toInt(),
                    nutrientsCollected = obj.optInt("nutrientsCollected", 0),
                    maxSizeReached = obj.optDouble("maxSizeReached", 1.0).toFloat(),
                    organismId = obj.optString("organismId", "proto_flagellate")
                )
                dao.insertRunRecord(entity)
            }
        }
    }

    @JavascriptInterface
    fun getLifetimeStatsJson(): String = runBlocking(Dispatchers.IO) {
        val runs = dao.getRecentRuns(15)
        val bestScore = dao.getBestScore() ?: 0
        val longestSurvival = dao.getLongestSurvivalSec() ?: 0
        val totalNutrients = dao.getTotalNutrientsCollected() ?: 0
        val totalGames = dao.getTotalGamesPlayed()
        val totalTime = dao.getTotalSurvivalTimeSec() ?: 0

        val recentArray = JSONArray()
        runs.forEach { r ->
            recentArray.put(
                JSONObject().apply {
                    put("id", r.id)
                    put("timestamp", r.timestamp)
                    put("score", r.score)
                    put("survivalTimeSec", r.survivalTimeSec)
                    put("nutrientsCollected", r.nutrientsCollected)
                    put("maxSizeReached", r.maxSizeReached)
                    put("organismId", r.organismId)
                }
            )
        }

        JSONObject().apply {
            put("bestScore", bestScore)
            put("longestSurvivalSec", longestSurvival)
            put("totalNutrientsCollected", totalNutrients)
            put("totalGamesPlayed", totalGames)
            put("totalTimeSurvivedSec", totalTime)
            put("recentRuns", recentArray)
        }.toString()
    }

    @JavascriptInterface
    fun saveSettingsJson(jsonPayload: String) {
        ioScope.launch {
            runCatching {
                dao.saveSettings(PlayerSettingsEntity(id = 1, settingsJson = jsonPayload))
            }
        }
    }

    @JavascriptInterface
    fun getSettingsJson(): String = runBlocking(Dispatchers.IO) {
        dao.getSettings()?.settingsJson ?: ""
    }

    @JavascriptInterface
    fun vibrate(durationMs: Int) {
        val clamped = durationMs.coerceIn(10, 200).toLong()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator?.vibrate(
                VibrationEffect.createOneShot(clamped, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            vibrator?.vibrate(
                VibrationEffect.createOneShot(clamped, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        }
    }

    @JavascriptInterface
    fun isXrSupported(): Boolean {
        val pm = context.packageManager
        return pm.hasSystemFeature("android.hardware.xr.immersive") ||
               pm.hasSystemFeature(PackageManager.FEATURE_VR_HEADTRACKING)
    }
}
