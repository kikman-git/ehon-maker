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
        "home.blank",
        "home.fromTemplate",
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
        "templates.stories", "templates.loading", "templates.offline", "templates.retry", "templates.editable",
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
        "share.link", "share.linkHint", "share.linkSignIn", "share.linkPending", "share.linkFailed",
        "share.linkRevoke", "share.linkNone", "share.linkFor", "share.linkOpens",
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

    val account = listOf("account.offline", "account.retry", "account.google", "account.signOut", "account.localOnly",
        "account.cloudUnavailable", "account.close", "sync.diskError", "sync.pending", "sync.saved", "sync.retrying",
        "sync.lease", "sync.read", "sync.localCopy", "sync.invalidId")

    /** Signing a browser in from the phone: the QR hand-off, decision 58. */
    val webLogin = listOf("web.login", "web.loginHint", "web.loginScan", "web.loginNoCamera", "web.loginCode",
        "web.loginCodeHint", "web.loginApprove", "web.loginConfirm", "web.loginDone", "web.loginFailed", "web.loginOffline")

    /** Part display names, keyed `part.<catalog name>`. */
    val parts: List<String> =
        app.ehon.catalog.PartCatalog.all.map { "part.${it.nameKey}" }

    val all: List<String> =
        home + templates + editor + read + fonts + share + guest + tablet +
            done + settings + shapes + categories + parts + account + webLogin
}
