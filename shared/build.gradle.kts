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
// document (decision #55) and writes them into DocumentTemplates.kt, so the same JSON ships in the
// phone framework and the web core. build/templates holds the assembled documents for `pnpm ehon-check`.
// (A line comment on purpose: Kotlin block comments nest, and a glob like art/... .svg inside one
// would swallow the rest of this script.)
val generateDocumentTemplates by tasks.registering {
    group = "ehon"
    description = "Assemble templates/*/story.json and art/*.svg into DocumentTemplates.kt"
    val sources = layout.projectDirectory.dir("templates")
    val kotlinOut = layout.buildDirectory.dir("generated/templates/kotlin")
    val jsonOut = layout.buildDirectory.dir("templates")
    inputs.dir(sources)
    outputs.dir(kotlinOut)
    outputs.dir(jsonOut)
    doLast {
        val generator = groovy.json.JsonGenerator.Options().disableUnicodeEscaping().build()
        val stories = sources.asFile.listFiles { file -> file.isDirectory }!!.map { dir ->
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
            val json = generator.toJson(mapOf("version" to 4, "book" to book))
            require("\"\"\"" !in json && '$' !in json) { "${dir.name}: a document may not contain triple quotes or dollar signs" }
            jsonOut.get().file("${story["id"]}.ehon.json").asFile.apply { parentFile.mkdirs() }.writeText(json)
            @Suppress("UNCHECKED_CAST")
            val description = story["description"] as Map<String, String>
            Triple(story["id"] as String, description, json)
        }
        val entries = stories.joinToString("\n") { (id, description, json) ->
            """        Entry(
            id = "$id",
            descriptionJa = "${description["ja"]}",
            descriptionEn = "${description["en"]}",
            json = ${"\"\"\""}$json${"\"\"\""},
        ),"""
        }
        val source = """package app.ehon.template

/**
 * Templates that are whole books written as documents, art included (decision #55). Generated from
 * `shared/templates/<story>/` by the `generateDocumentTemplates` Gradle task; edit the SVG and JSON
 * there, not this file.
 */
object DocumentTemplates {
    data class Entry(val id: String, val descriptionJa: String, val descriptionEn: String, val json: String)

    val all: List<Entry> = listOf(
$entries
    )

    fun find(id: String): Entry? = all.firstOrNull { it.id == id }
}
"""
        kotlinOut.get().file("app/ehon/template/DocumentTemplates.kt").asFile.apply { parentFile.mkdirs() }.writeText(source)
    }
}

kotlin.sourceSets.named("commonMain") { kotlin.srcDir(generateDocumentTemplates) }

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
