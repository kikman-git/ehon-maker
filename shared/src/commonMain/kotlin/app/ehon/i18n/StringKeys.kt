package app.ehon.i18n

/**
 * Every user-visible string key the app ships.
 *
 * Kept as an exhaustive list in the core for two reasons beyond type safety: it is the
 * input to the font subset build step (decision #10 — Zen Maru Gothic ships only the
 * glyphs these strings actually use), and it lets a test assert that every locale
 * defines every key, which is the thing that otherwise ships tofu silently.
 */
object StringKeys {

    val home = listOf(
        "home.greeting", // 「こんにちは、%sちゃん」
        "home.shelf",
        "home.filter.all",
        "home.filter.inProgress",
        "home.filter.finished",
        "home.newBook",
        "nav.shelf",
        "nav.make",
        "nav.read",
        "book.status.inProgress",
        "book.status.finished",
        "book.pages", // 「%dページ」
        "book.pagesOf", // 「%d / %dページ」
    )

    val templates = listOf(
        "templates.title",
        "templates.intro",
        "templates.hintIncluded",
        "tag.all", "tag.creatures", "tag.adventure", "tag.magic", "tag.everyday", "tag.free",
        "tpl.forest.name", "tpl.forest.desc",
        "tpl.forest.p1", "tpl.forest.p2", "tpl.forest.p3", "tpl.forest.p4",
        "tpl.space.name", "tpl.space.desc",
        "tpl.space.p1", "tpl.space.p2", "tpl.space.p3",
        "tpl.sweets.name", "tpl.sweets.desc",
        "tpl.sweets.p1", "tpl.sweets.p2", "tpl.sweets.p3",
        "tpl.today.name", "tpl.today.desc",
        "tpl.today.p1", "tpl.today.p2", "tpl.today.p3",
        "tpl.blank.name", "tpl.blank.desc", "tpl.blank.p1",
        "tpl.continue",
    )

    val editor = listOf(
        "editor.read",
        "editor.done",
        "editor.pageLabel",
        "mode.stick", "mode.stick.sub",
        "mode.draw", "mode.draw.sub",
        "mode.text", "mode.text.sub",
        "editor.backgroundColour",
        "sel.smaller", "sel.bigger", "sel.delete", "sel.forward", "sel.backward",
        "ui.kid", "ui.adult", "ui.adultHint",
        "draw.eraser", "draw.undo", "draw.clearAll", "draw.clearAll.confirm", "draw.hint",
        "text.placeholder", "text.rubyPlaceholder", "text.ruby",
        "text.commit", "text.done", "text.panelTitle", "text.close",
        "toast.partPlaced", "toast.pageAdded", "toast.pageMoved", "toast.enterText",
    )

    val read = listOf(
        "read.aloud",
        "read.stop",
        "read.night", "read.nightHint", "read.goodnight",
        "read.replyChip", // 「%s の こえ · %sびょう」
        "read.replyPlaying",
        "read.cannotSpeak", "read.cannotPlayVoice",
    )

    /** The six selectable faces plus download states. Decision 2a. */
    val fonts = listOf(
        "font.handwriting", "font.rounded", "font.storybook",
        "font.pop", "font.marker", "font.boldRound",
        "font.downloading", "font.downloadFailed",
    )

    /** かぞくに おくる. */
    val share = listOf(
        "share.title", "share.who", "share.whoHint",
        "share.include", "share.voice", "share.voiceHint",
        "share.printFile", "share.printFileHint", "share.adultNote",
        "share.send", "share.sendCount", "share.sent", "share.sentHint",
        "share.readMyself", "share.pickSomeone", "share.backToShelf",
        "family.grandma", "family.grandma.sub",
        "family.grandpa", "family.grandpa.sub",
        "family.mom", "family.mom.sub",
        "family.dad", "family.dad.sub",
    )

    /** The link-opened read screen a family member sees. Decision 3b. */
    val guest = listOf(
        "guest.arrived", // 「%sちゃん から とどきました」
        "guest.holdToRecord", "guest.releaseToSend",
        "guest.recording", // 「ろくおん ちゅう %sびょう」
        "guest.hint", "guest.tooShort", "guest.sent",
    )

    /** iPad chrome. Decision 3a. */
    val tablet = listOf(
        "tablet.makeTogether", "tablet.readSpread", "tablet.backToMake",
        "tablet.rotateTitle", "tablet.rotateBody", "tablet.gotIt",
        "tablet.drawHint", "tablet.textCardTitle",
    )

    val done = listOf(
        "done.title",
        "done.meta", // 「%dページ の えほん が できました。」
        "done.sendToFamily",
        "done.print",
        "done.makeRealBook",
        "done.backToShelf",
        "done.keepForever", // the anonymous→linked prompt, decision #15
        "done.keepForever.body",
        "done.keepForever.later",
    )

    val settings = listOf(
        "settings.title",
        "settings.bigTargets",
        "settings.backupAll",
        "settings.restore",
        "settings.privacy",
        "settings.signIn",
        "settings.signedInAs",
        "gate.title", // parental gate
        "gate.body",
    )

    val shapes = listOf(
        "shape.square", "shape.landscape", "shape.portrait", "shape.pick",
    )

    val categories = listOf(
        "cat.shapes", "cat.creatures", "cat.seaSky", "cat.nature", "cat.magic",
    )

    /** Part display names, keyed `part.<catalog name>`. */
    val parts: List<String> =
        app.ehon.catalog.PartCatalog.all.map { "part.${it.nameKey}" }

    val all: List<String> =
        home + templates + editor + read + fonts + share + guest + tablet +
            done + settings + shapes + categories + parts
}
