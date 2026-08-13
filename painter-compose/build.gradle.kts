plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.compose.compiler)
}

kotlin {
    // JVM only for phase 1. Compose Desktop renders through the same Skia as Compose
    // Android, so the painter and its pixel goldens run with no Android SDK installed —
    // which is what keeps the shared core honest while iOS ships first.
    jvm()

    sourceSets {
        commonMain.dependencies {
            implementation(project(":shared"))
            implementation(compose.foundation)
            implementation(compose.ui)
        }
        jvmTest.dependencies {
            implementation(kotlin("test"))
            implementation(compose.desktop.currentOs)
        }
    }
}
