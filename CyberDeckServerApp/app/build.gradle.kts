import java.util.Properties

plugins {
    id("com.android.application")
}

val localProperties = Properties()
val localPropertiesFile = rootProject.file("../CyberDeckClient/local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}

fun getProp(name: String): String {
    return (localProperties.getProperty(name) ?: project.findProperty(name)) as String? ?: ""
}

android {
    namespace = "com.saro.cyberdeck.server"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.saro.cyberdeck.server"
        minSdk = 24
        targetSdk = 35
        versionCode = 5
        versionName = "1.0.5"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }

        externalNativeBuild {
            cmake {
                cppFlags("")
                arguments("-DANDROID_STL=c++_shared")
            }
        }
    }

    signingConfigs {
        create("productionSigning") {
            val keyStorePath = getProp("MY_KEYSTORE_FILE")
            if (keyStorePath.isNotEmpty()) {
                storeFile = file(keyStorePath)
                storePassword = getProp("MY_KEYSTORE_PASSWORD")
                keyAlias = getProp("MY_KEY_ALIAS")
                keyPassword = getProp("MY_KEY_PASSWORD")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }

    packaging {
        jniLibs {
            useLegacyPackaging = false
            excludes += "lib/**/x86*"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("productionSigning")

            // Android 15/16 16KB page size alignment
            @Suppress("UnstableApiUsage")
            externalNativeBuild {
                cmake {
                    // This creates 16KB aligned binaries
                    cppFlags("-Wl,-z,max-page-size=16384")
                }
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.cardview:cardview:1.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
