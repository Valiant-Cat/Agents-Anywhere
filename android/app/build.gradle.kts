import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val officialServerUrl = providers.environmentVariable("CLOUD_SERVER_URL")
    .orElse("https://web.agents-anywhere.com").get().trimEnd('/')
val localSettings = Properties().apply {
    rootProject.file("local.properties").takeIf { it.isFile }?.inputStream()?.use { load(it) }
}
val debugServerUrl = providers.gradleProperty("agentsAnywhere.serverUrl")
    .orElse(localSettings.getProperty("agentsAnywhere.serverUrl", officialServerUrl))
    .get()

fun String.asBuildConfigString(): String = "\"" + replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")
    .replace("\r", "\\r") + "\""

android {
    namespace = "com.agentsanywhere.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.agentsanywhere.app"
        minSdk = 26
        targetSdk = 36
        versionCode = providers.environmentVariable("ANDROID_VERSION_CODE").orNull?.toInt() ?: 12
        versionName = providers.environmentVariable("ANDROID_VERSION_NAME").orNull ?: "2.2.0.1"
        buildConfigField("String", "OFFICIAL_SERVER_URL", officialServerUrl.asBuildConfigString())
        buildConfigField("String", "UPDATE_DOWNLOAD_URL",
            (providers.environmentVariable("ANDROID_UPDATE_DOWNLOAD_URL").orNull
                ?: if (providers.environmentVariable("CLOUD_SERVER_URL").isPresent)
                    "$officialServerUrl/download/android/latest?from=update"
                else "https://www.agents-anywhere.com/api/download/android/latest?from=update")
                .asBuildConfigString())
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        if (providers.environmentVariable("ANDROID_KEYSTORE_PATH").isPresent) {
            create("release") {
                storeFile = file(providers.environmentVariable("ANDROID_KEYSTORE_PATH").get())
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "OFFICIAL_SERVER_URL", debugServerUrl.asBuildConfigString())
        }
        release {
            signingConfigs.findByName("release")?.let { signingConfig = it }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(platform(libs.sora.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.mlkit.vision)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.compose.shimmer)
    implementation(libs.commonmark)
    implementation(libs.commonmark.ext.autolink)
    implementation(libs.commonmark.ext.gfm.strikethrough)
    implementation(libs.commonmark.ext.gfm.tables)
    implementation(libs.commonmark.ext.task.list.items)
    implementation(libs.jlatexmath.android)
    implementation(libs.jlatexmath.android.font.cyrillic)
    implementation(libs.jlatexmath.android.font.greek)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.webkit)
    implementation(libs.lucide.icons)
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.okhttp)
    implementation(libs.sora.editor)
    implementation(libs.sora.language.textmate)
    implementation(libs.sora.oniguruma.native)
    implementation(libs.telephoto.zoomable.image.coil3)
    implementation(libs.termux.terminal.view)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
    testImplementation(libs.junit)
    testImplementation("org.json:json:20240303")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.robolectric:robolectric:4.17")
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

tasks.named("check") {
    dependsOn(rootProject.tasks.named("checkLegacyRoutes"))
}
