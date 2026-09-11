"""Localized prose and locale identifiers for server-rendered metadata.

Entry titles and bodies are content, so they stay exactly as contributors wrote
them.  The words around that content -- counts, summaries, empty states and the
site description -- are interface text and follow the interface locale.
"""

from numfmt import grouped_value


OG_LOCALES = {
    "en": "en_US",
    "ko": "ko_KR",
    "ja": "ja_JP",
    "zh-Hans": "zh_CN",
    "es": "es_ES",
    "fr": "fr_FR",
    "de": "de_DE",
}


TEXT = {
    "en": {
        "site_title": "Namba — a wiki of numbers",
        "site_desc": ("Every number means something to someone. An open wiki of what "
                      "numbers mean in film, music, science, history, memes and brands."),
        "image_alt": "Namba — every number means something to someone",
        "guide_title": "Entry guidelines — Namba",
        "guide_name": "Entry guidelines",
        "guide_desc": ("What makes an entry on Namba: a number in a work, a number that "
                       "stands for something, a constant. Not a number that only counts "
                       "its own sequels."),
        "one": "1 entry", "many": "{n} entries",
        "number_lead": "What {subject} means",
        "calendar_lead": "What happens on {subject}",
        "abbreviation_lead": "What {subject} stands for",
        "tag_lead": "Numbers tagged {subject}",
        "list": "{lead} — {count} on Namba: {titles}{more}",
        "more": "; and {n} more.", "end": ".", "join": "; ",
        "empty_value": "Nothing is filed under {subject} on Namba yet.",
        "empty_tag": "Nothing on Namba is tagged {subject} yet.",
        "post_number": "{title} — what {value} means, on Namba.",
        "post_calendar": "{title} — what happens on {value}, on Namba.",
        "post_abbreviation": "{title} — what {value} stands for, on Namba.",
    },
    "ko": {
        "site_title": "Namba — 숫자의 의미를 모으는 위키",
        "site_desc": ("모든 숫자는 누군가에게 의미가 있습니다. 영화, 음악, 과학, 역사, "
                      "밈과 브랜드 속 숫자의 의미를 모으는 열린 위키입니다."),
        "image_alt": "Namba — 모든 숫자는 누군가에게 의미가 있습니다",
        "guide_title": "항목 작성 지침 — Namba", "guide_name": "항목 작성 지침",
        "guide_desc": ("Namba에 작성할 수 있는 항목을 설명합니다. 작품 속 숫자, 무언가를 "
                       "나타내는 숫자, 상수는 포함하며 속편의 개수만 세는 숫자는 제외합니다."),
        "one": "항목 1개", "many": "항목 {n}개",
        "number_lead": "{subject}의 의미",
        "calendar_lead": "{subject}에 무슨 일이 있는지",
        "abbreviation_lead": "{subject}가 나타내는 것",
        "tag_lead": "{subject} 태그가 붙은 숫자",
        "list": "{lead} — Namba의 {count}: {titles}{more}",
        "more": "; 그 외 {n}개.", "end": ".", "join": "; ",
        "empty_value": "{subject}에 등록된 항목이 아직 없습니다.",
        "empty_tag": "{subject} 태그가 붙은 항목이 아직 없습니다.",
        "post_number": "{title} — Namba에서 {value}가 뜻하는 것.",
        "post_calendar": "{title} — Namba에서 {value}에 무슨 일이 있는지.",
        "post_abbreviation": "{title} — Namba에서 {value}가 나타내는 것.",
    },
    "ja": {
        "site_title": "Namba — 数字の意味を集めるウィキ",
        "site_desc": ("あらゆる数字には、誰かにとっての意味があります。映画、音楽、科学、歴史、"
                      "ミーム、ブランドに登場する数字の意味を集めるオープンなウィキです。"),
        "image_alt": "Namba — あらゆる数字には誰かにとっての意味があります",
        "guide_title": "項目ガイドライン — Namba", "guide_name": "項目ガイドライン",
        "guide_desc": ("Nambaに掲載できる項目について説明します。作品に登場する数字、何かを表す数字、"
                       "定数は対象ですが、続編の数を数えるだけの数字は対象外です。"),
        "one": "1件の項目", "many": "{n}件の項目",
        "number_lead": "{subject}の意味",
        "calendar_lead": "{subject}は何の日か",
        "abbreviation_lead": "{subject}が表すもの",
        "tag_lead": "「{subject}」タグの数字",
        "list": "{lead} — Nambaの{count}: {titles}{more}",
        "more": "、ほか{n}件。", "end": "。", "join": "、",
        "empty_value": "{subject}の項目はまだありません。",
        "empty_tag": "{subject}タグの項目はまだありません。",
        "post_number": "{title} — Nambaで{value}が意味するもの。",
        "post_calendar": "{title} — Nambaで{value}は何の日か。",
        "post_abbreviation": "{title} — Nambaで{value}が表すもの。",
    },
    "zh-Hans": {
        "site_title": "Namba — 汇集数字含义的维基",
        "site_desc": ("每个数字对某个人都有特殊含义。一个开放维基，收录数字在电影、音乐、科学、"
                      "历史、网络迷因和品牌中的含义。"),
        "image_alt": "Namba — 每个数字对某个人都有特殊含义",
        "guide_title": "条目指南 — Namba", "guide_name": "条目指南",
        "guide_desc": ("说明哪些内容适合成为Namba条目：作品中的数字、代表某种事物的数字和常数。"
                       "仅用于计算续集数量的数字不在此列。"),
        "one": "1个条目", "many": "{n}个条目",
        "number_lead": "{subject}的含义",
        "calendar_lead": "{subject}是什么日子",
        "abbreviation_lead": "{subject}所代表的含义",
        "tag_lead": "带有“{subject}”标签的数字",
        "list": "{lead} — Namba上的{count}：{titles}{more}",
        "more": "；另有{n}个。", "end": "。", "join": "；",
        "empty_value": "{subject}下还没有条目。",
        "empty_tag": "还没有带有{subject}标签的条目。",
        "post_number": "{title} — {value}在Namba上的含义。",
        "post_calendar": "{title} — {value}在Namba上是什么日子。",
        "post_abbreviation": "{title} — {value}在Namba上所代表的含义。",
    },
    "es": {
        "site_title": "Namba — una wiki sobre números",
        "site_desc": ("Todos los números significan algo para alguien. Una wiki abierta sobre "
                      "lo que significan los números en el cine, la música, la ciencia, la "
                      "historia, los memes y las marcas."),
        "image_alt": "Namba — todos los números significan algo para alguien",
        "guide_title": "Guía para las entradas — Namba", "guide_name": "Guía para las entradas",
        "guide_desc": ("Qué puede ser una entrada de Namba: un número en una obra, un número que "
                       "representa algo o una constante. No un número que solo cuenta sus secuelas."),
        "one": "1 entrada", "many": "{n} entradas",
        "number_lead": "Qué significa {subject}",
        "calendar_lead": "Qué se celebra el {subject}",
        "abbreviation_lead": "Qué significa la abreviatura {subject}",
        "tag_lead": "Números con la etiqueta {subject}",
        "list": "{lead} — {count} en Namba: {titles}{more}",
        "more": "; y {n} más.", "end": ".", "join": "; ",
        "empty_value": "Aún no hay entradas para {subject}.",
        "empty_tag": "Aún no hay entradas con la etiqueta {subject}.",
        "post_number": "{title} — qué significa {value} en Namba.",
        "post_calendar": "{title} — qué se celebra el {value} en Namba.",
        "post_abbreviation": "{title} — qué significa {value} como abreviatura en Namba.",
    },
    "fr": {
        "site_title": "Namba — un wiki sur les nombres",
        "site_desc": ("Chaque nombre signifie quelque chose pour quelqu’un. Un wiki ouvert sur le "
                      "sens des nombres dans le cinéma, la musique, la science, l’histoire, les "
                      "mèmes et les marques."),
        "image_alt": "Namba — chaque nombre signifie quelque chose pour quelqu’un",
        "guide_title": "Guide des entrées — Namba", "guide_name": "Guide des entrées",
        "guide_desc": ("Ce qui peut constituer une entrée sur Namba : un nombre dans une œuvre, un "
                       "nombre qui représente quelque chose ou une constante. Pas un nombre qui ne "
                       "fait que compter ses propres suites."),
        "one": "1 entrée", "many": "{n} entrées",
        "number_lead": "Ce que signifie {subject}",
        "calendar_lead": "Ce qui se passe le {subject}",
        "abbreviation_lead": "Ce que signifie l’abréviation {subject}",
        "tag_lead": "Nombres portant l’étiquette {subject}",
        "list": "{lead} — {count} sur Namba : {titles}{more}",
        "more": " ; et {n} de plus.", "end": ".", "join": " ; ",
        "empty_value": "Aucune entrée n’est encore associée à {subject}.",
        "empty_tag": "Aucune entrée ne porte encore l’étiquette {subject}.",
        "post_number": "{title} — ce que signifie {value} sur Namba.",
        "post_calendar": "{title} — ce qui se passe le {value} sur Namba.",
        "post_abbreviation": "{title} — ce que signifie l’abréviation {value} sur Namba.",
    },
    "de": {
        "site_title": "Namba — ein Wiki über Zahlen",
        "site_desc": ("Jede Zahl bedeutet jemandem etwas. Ein offenes Wiki darüber, was Zahlen in "
                      "Film, Musik, Wissenschaft, Geschichte, Memes und Marken bedeuten."),
        "image_alt": "Namba — jede Zahl bedeutet jemandem etwas",
        "guide_title": "Richtlinien für Einträge — Namba", "guide_name": "Richtlinien für Einträge",
        "guide_desc": ("Was ein Eintrag auf Namba sein kann: eine Zahl in einem Werk, eine Zahl, die "
                       "für etwas steht, oder eine Konstante. Nicht eine Zahl, die nur die eigenen "
                       "Fortsetzungen zählt."),
        "one": "1 Eintrag", "many": "{n} Einträge",
        "number_lead": "Was {subject} bedeutet",
        "calendar_lead": "Was am {subject} passiert",
        "abbreviation_lead": "Wofür die Abkürzung {subject} steht",
        "tag_lead": "Zahlen mit dem Tag {subject}",
        "list": "{lead} — {count} auf Namba: {titles}{more}",
        "more": "; und {n} weitere.", "end": ".", "join": "; ",
        "empty_value": "Unter {subject} ist noch nichts eingetragen.",
        "empty_tag": "Noch keine Einträge mit dem Tag {subject}.",
        "post_number": "{title} — was {value} auf Namba bedeutet.",
        "post_calendar": "{title} — was am {value} auf Namba passiert.",
        "post_abbreviation": "{title} — wofür {value} auf Namba steht.",
    },
}


def words(locale="en"):
    return TEXT.get(locale, TEXT["en"])


def count(n, locale="en"):
    text = words(locale)
    shown = grouped_value(str(n), True, locale)
    return (text["one"] if n == 1 else text["many"]).format(n=shown)


def list_title(subject, n, locale="en"):
    return f"{subject} — {count(n, locale)} · Namba"


def list_summary(kind, subject, titles, total, locale="en"):
    text = words(locale)
    lead = text[f"{kind}_lead"].format(subject=subject)
    rest = total - len(titles)
    more = text["more"].format(n=grouped_value(str(rest), True, locale)) \
        if rest else text["end"]
    return text["list"].format(
        lead=lead, count=count(total, locale),
        titles=text["join"].join(titles), more=more,
    )


def empty_summary(kind, subject, locale="en"):
    key = "empty_tag" if kind == "tag" else "empty_value"
    return words(locale)[key].format(subject=subject)


def post_summary(title, value, kind="number", locale="en"):
    """One entry's own description.

    `kind` is the noun the entry's section is spoken in -- the same word
    list_summary() takes, so there is one vocabulary of kinds rather than a
    bool per section added.
    """
    return words(locale)[f"post_{kind}"].format(title=title, value=value)
