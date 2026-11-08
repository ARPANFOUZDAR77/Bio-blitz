# Keep JavascriptInterface bridge methods from being obfuscated by R8
-keepclassmembers class com.bioblitz.microsurvival.BioBlitzJavascriptBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keep class com.bioblitz.microsurvival.data.** { *; }
