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

/**
 * Emits every shipped UI string for the font subset step. Consumed by `make fonts`;
 * see tools/subset-fonts.sh.
 */
tasks.register<JavaExec>("dumpShippedText") {
    group = "ehon"
    description = "Write all shipped UI strings to build/shipped-text.txt"
    dependsOn("jvmMainClasses")
    classpath = files(
        layout.buildDirectory.dir("classes/kotlin/jvm/main"),
        configurations.named("jvmRuntimeClasspath"),
    )
    mainClass.set("app.ehon.tools.DumpShippedTextKt")
    args(layout.buildDirectory.file("shipped-text.txt").get().asFile.absolutePath)
}
