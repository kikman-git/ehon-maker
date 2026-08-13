package app.ehon.i18n

/**
 * Japanese chrome, written わかちがき — hiragana with spaces, the convention for writing to
 * Japanese 4-to-6-year-olds. Kanji appears only in copy aimed at a parent.
 *
 * The 56 part names are omitted deliberately: in Japanese a part's key *is* its name.
 */
internal object StringsJa {
    val table: Map<String, String> = mapOf(
        // home
        "home.greeting" to "こんにちは、%sちゃん",
        "home.shelf" to "ほんだな",
        "home.filter.all" to "ぜんぶ %s さつ",
        "home.filter.inProgress" to "つくりかけ %s",
        "home.filter.finished" to "できあがり %s",
        "home.newBook" to "あたらしく つくる",
        "home.empty" to "まだ えほんが ありません。\nさいしょの 1さつを つくってみよう。",
        "nav.shelf" to "ほんだな",
        "nav.make" to "つくる",
        "nav.read" to "よむ",
        "book.status.inProgress" to "つくりかけ",
        "book.status.finished" to "できあがり",
        "book.pages" to "%sページ",
        "book.pagesOf" to "%s / %sページ",
        "book.untitled" to "なまえの ない えほん",

        // templates
        "templates.title" to "テンプレート",
        "templates.intro" to "おはなしの かたち を えらぶと、ページと ヒント が はいった じょうたい で はじめられます。",
        "templates.hintIncluded" to "ヒントつき",
        "tag.all" to "すべて",
        "tag.creatures" to "いきもの",
        "tag.adventure" to "ぼうけん",
        "tag.magic" to "まほう",
        "tag.everyday" to "まいにち",
        "tag.free" to "じゆう",

        "tpl.forest.name" to "もりの ともだち",
        "tpl.forest.desc" to "はじまり・であい・できごと・おわり の 4つの ばめん。どうぶつの パーツ が そろっています。",
        "tpl.forest.p1" to "だれが でてくる？",
        "tpl.forest.p2" to "どこで あった？",
        "tpl.forest.p3" to "なにが おきた？",
        "tpl.forest.p4" to "さいごは どうなった？",
        "tpl.space.name" to "うちゅうへ いこう",
        "tpl.space.desc" to "よるの そら の ページ。ロケット・ほし・おつきさま で ぼうけん の おはなし を つくれます。",
        "tpl.space.p1" to "しゅっぱつ！",
        "tpl.space.p2" to "そらの うえ で",
        "tpl.space.p3" to "であった もの",
        "tpl.sweets.name" to "まほうの おかしや",
        "tpl.sweets.desc" to "おしろ と まほう の パーツ。ふしぎな おみせ の おはなし の ひな形 です。",
        "tpl.sweets.p1" to "おみせに ようこそ",
        "tpl.sweets.p2" to "なにを かった？",
        "tpl.sweets.p3" to "まほうを かけたら…",
        "tpl.today.name" to "きょうの できごと",
        "tpl.today.desc" to "いちにち を 3ページ で。えにっき の ように つかえる シンプルな かたち。",
        "tpl.today.p1" to "あさ",
        "tpl.today.p2" to "ひる",
        "tpl.today.p3" to "よる",
        "tpl.blank.name" to "まっさら な ページ",
        "tpl.blank.desc" to "なにも ない ページ から はじめます。すきな だけ ページ を ふやせます。",
        "tpl.blank.p1" to "じゆうに かいてみよう",
        "tpl.continue" to "つづきを かいてみよう",

        // editor
        "editor.read" to "よむ",
        "editor.done" to "できた",
        "editor.pageLabel" to "ページ %s / %s",
        "mode.stick" to "はる",
        "mode.stick.sub" to "パーツ",
        "mode.draw" to "かく",
        "mode.draw.sub" to "ゆびで",
        "mode.text" to "もじ",
        "mode.text.sub" to "ぶんしょう",
        "editor.backgroundColour" to "はいけい の いろ",
        "sel.smaller" to "ちいさく",
        "sel.bigger" to "おおきく",
        "sel.delete" to "けす",
        "draw.eraser" to "けしゴム",
        "draw.undo" to "ひとつ もどす",
        "draw.clearAll" to "ぜんぶ けす",
        "draw.clearAll.confirm" to "ぜんぶ けして いい？",
        "draw.hint" to "ゆびで ページに ちょくせつ かけます。パーツの うえにも かけます。",
        "text.placeholder" to "ここに ぶんしょう を いれる",
        "text.rubyPlaceholder" to "ふりがな（かんじの よみかた）",
        "text.ruby" to "ふりがな",
        "text.commit" to "ページに いれる",
        "text.done" to "かんりょう",
        "text.panelTitle" to "もじを いれる",
        "text.close" to "とじる",
        "toast.partPlaced" to "パーツを おいたよ",
        "toast.pageAdded" to "ページを ふやしたよ",
        "toast.enterText" to "もじを いれてね",

        // read
        "read.aloud" to "よみあげ",
        "read.stop" to "とめる",

        // done
        "done.title" to "できあがり！",
        "done.meta" to "%sページ の えほん が できました。",
        "done.sendToFamily" to "かぞくに おくる",
        "done.print" to "プリントする",
        "done.makeRealBook" to "ほんに して とどける",
        "done.backToShelf" to "ほんだな に もどる",
        "done.keepForever" to "この えほんを ずっと とっておく",
        "done.keepForever.body" to "サインイン すると、あたらしい スマホでも この えほんを ひらけます。",
        "done.keepForever.later" to "あとで",

        // settings + gate
        "settings.title" to "せってい",
        "settings.bigTargets" to "ボタンを 大きく",
        "settings.backupAll" to "ぜんぶ ほぞん",
        "settings.restore" to "もとに もどす",
        "settings.privacy" to "プライバシーポリシー",
        "settings.signIn" to "サインイン",
        "settings.signedInAs" to "%s で サインイン中",
        "gate.title" to "おうちの ひとへ",
        "gate.body" to "つづけるには、こたえを いれてください。%s",

        // shapes
        "shape.square" to "しかく",
        "shape.landscape" to "よこなが",
        "shape.portrait" to "たてなが",
        "shape.pick" to "ページの かたち",

        // part categories
        "cat.shapes" to "かたち",
        "cat.creatures" to "いきもの",
        "cat.seaSky" to "うみと そら",
        "cat.nature" to "しぜん",
        "cat.magic" to "まほう",
    )
}
