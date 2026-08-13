plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvm()
    iosArm64()
    iosSimulatorArm64()
    iosX64()

    // Phase 1 ships iOS only; the jvm target exists so the Compose painter and
    // the golden tests run without an Android SDK. androidTarget() lands in phase 2.

    listOf(iosArm64(), iosSimulatorArm64(), iosX64()).forEach {
        it.binaries.framework {
            baseName = "EhonCore"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.serialization.cbor)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.collections.immutable)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.serialization.json)
        }
    }
}
