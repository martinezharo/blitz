import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
}

val appVersion = (JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val parts = appVersion.split('.').map(String::toInt)
require(parts.size == 3 && parts.all { it in 0..999 }) { "Use a three-part version with components below 1000" }

android {
    namespace = "com.fouroli.blitz"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.fouroli.blitz"
        minSdk = 24
        targetSdk = 36
        versionName = appVersion
        versionCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    val keystore = System.getenv("BLITZ_KEYSTORE")
    if (keystore != null) {
        signingConfigs {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("BLITZ_KEYSTORE_PASSWORD")
                keyAlias = "blitz"
                keyPassword = System.getenv("BLITZ_KEYSTORE_PASSWORD")
            }
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("release")
    }
    buildTypes.getByName("release") {
        isMinifyEnabled = true
        isShrinkResources = true
        proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
