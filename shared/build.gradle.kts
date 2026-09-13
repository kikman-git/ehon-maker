import java.security.MessageDigest
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvm()
    js(IR) {
        browser {
            testTask {
                useKarma { useChromeHeadless() }
            }
        }
        nodejs()
        binaries.library()
        generateTypeScriptDefinitions()
        useEsModules()
    }
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

// Assembles each templates/<story>/story.json with the SVG files in its art folder into one .ehon
// document (decision #55) plus an index.json, in build/templates. The documents are published to the
// assets bucket (decision #60, `pnpm templates` in backend/), served to the web dev server and read
// by `pnpm ehon-check` and the JVM template tests; nothing is compiled into the clients.
// (A line comment on purpose: Kotlin block comments nest, and a glob like art/... .svg inside one
// would swallow the rest of this script.)
val assembleTemplates = tasks.register("assembleTemplates") {
    group = "ehon"
    description = "Assemble templates/*/story.json and art/*.svg into build/templates/*.ehon.json and index.json"
    val sources = layout.projectDirectory.dir("templates")
    val jsonOut = layout.buildDirectory.dir("templates")
    inputs.dir(sources)
    outputs.dir(jsonOut)
    doLast {
        val generator = groovy.json.JsonGenerator.Options().disableUnicodeEscaping().build()
        val out = jsonOut.get().asFile.apply { mkdirs() }
        out.listFiles { file -> file.extension == "json" }?.forEach { it.delete() }
        val entries = sources.asFile.listFiles { file -> file.isDirectory }!!.map { dir ->
            @Suppress("UNCHECKED_CAST")
            val story = groovy.json.JsonSlurper().parse(dir.resolve("story.json")) as MutableMap<String, Any?>
            dir to story
        }.sortedWith(compareBy({ (_, story) -> (story["order"] as? Number)?.toInt() ?: Int.MAX_VALUE }, { (dir, _) -> dir.name })).map { (dir, story) ->
            @Suppress("UNCHECKED_CAST")
            val book = story["book"] as MutableMap<String, Any?>
            @Suppress("UNCHECKED_CAST")
            val art = book["art"] as Map<String, MutableMap<String, Any?>>
            art.forEach { (key, entry) ->
                val file = dir.resolve("art/" + (entry.remove("file") ?: "$key.svg"))
                // Only whitespace between tags, the <title> and the xmlns go; the SVG itself is what the app draws.
                entry["svg"] = file.readText().trim().replace(Regex("<title>.*?</title>", RegexOption.DOT_MATCHES_ALL), "").replace(" xmlns=\"http://www.w3.org/2000/svg\"", "").replace(Regex(">\\s+<"), "><").replace(Regex("\\s{2,}"), " ")
            }
            val id = story["id"] as String
            val json = generator.toJson(mapOf("version" to 4, "book" to book))
            val bytes = json.toByteArray(Charsets.UTF_8)
            val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            out.resolve("$id.ehon.json").writeBytes(bytes)
            @Suppress("UNCHECKED_CAST")
            val pages = book["pages"] as List<*>
            linkedMapOf(
                "id" to id,
                "order" to ((story["order"] as? Number)?.toInt() ?: Int.MAX_VALUE),
                "title" to book["title"],
                "description" to story["description"],
                "shape" to book["shape"],
                "pageCount" to pages.size,
                "format" to 4,
                "bytes" to bytes.size,
                "sha256" to sha256,
                // Content-addressed, so a published document is immutable and the index can be cached briefly.
                "url" to "$id/${sha256.take(12)}.ehon.json",
                "file" to "$id.ehon.json",
            )
        }
        out.resolve("index.json").writeText(generator.toJson(mapOf("version" to 1, "templates" to entries)))
    }
}

tasks.named<Test>("jvmTest") {
    dependsOn(assembleTemplates)
    systemProperty("ehon.templates", layout.buildDirectory.dir("templates").get().asFile.absolutePath)
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
