package com.bioblitz.microsurvival.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * Native Android AudioTrack PCM synthesizer for low-latency procedural game sound effects.
 */
class NativeAudioEngine {
    private val audioScope = CoroutineScope(Dispatchers.Default)
    private val sampleRate = 22050

    @Volatile
    var sfxVolume: Float = 0.75f

    @Volatile
    var muted: Boolean = false

    fun playNutrientChime() {
        if (muted || sfxVolume <= 0.01f) return
        playTone(startFreq = 540.0, endFreq = 810.0, durationSec = 0.14)
    }

    fun playDamageImpact() {
        if (muted || sfxVolume <= 0.01f) return
        playTone(startFreq = 160.0, endFreq = 45.0, durationSec = 0.26)
    }

    fun playAbilityActivate() {
        if (muted || sfxVolume <= 0.01f) return
        playTone(startFreq = 260.0, endFreq = 680.0, durationSec = 0.32)
    }

    private fun playTone(startFreq: Double, endFreq: Double, durationSec: Double) {
        audioScope.launch {
            runCatching {
                val numSamples = (sampleRate * durationSec).toInt()
                val buffer = ShortArray(numSamples)
                var phase = 0.0
                for (i in 0 until numSamples) {
                    val t = i.toDouble() / numSamples
                    val freq = startFreq + (endFreq - startFreq) * t
                    val envelope = exp(-4.5 * t) * sfxVolume
                    phase += (2.0 * PI * freq) / sampleRate
                    buffer[i] = (sin(phase) * envelope * Short.MAX_VALUE * 0.5).toInt().toShort()
                }

                val track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(buffer.size * 2)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()

                track.write(buffer, 0, buffer.size)
                track.play()
                Thread.sleep((durationSec * 1000).toLong() + 40)
                track.release()
            }
        }
    }
}
