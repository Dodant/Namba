/* oxlint-disable react/only-export-components -- the provider and its hook share
   one private context; splitting them would export that implementation detail. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type UiLocale = 'en' | 'ko' | 'ja' | 'zh-Hans' | 'es'

const EN = {
  siteTitle: 'Namba — a wiki of numbers',
  tagline: 'An open wiki about numbers',
  common: {
    loading: 'Loading…',
    backToIndex: 'Back to the index.',
    addFirst: 'Add the first one.',
    anonymous: 'anonymous',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'edit',
    restore: 'Restore',
    by: (name: string) => `by ${name}`,
    edited: (when: string, name?: string | null) =>
      `edited ${when}${name ? ` by ${name}` : ''}`,
    entries: (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
    tags: (n: number) => `${n} ${n === 1 ? 'tag' : 'tags'}`,
    subject: (abbr: boolean, n = 1): string =>
      abbr ? (n === 1 ? 'abbreviation' : 'abbreviations') : n === 1 ? 'number' : 'numbers',
  },
  format: {
    INTEGER: 'Integer', DECIMAL: 'Decimal', MIXED: 'Mixed', TIME: 'Time', ABBR: 'Abbreviation',
  },
  buckets: {
    '1': '1 – 9', '10': '10 – 99', '100': '100 – 999',
    '1000': '1,000 – 9,999', '10000+': '10,000 and up',
  },
  header: {
    searchLabel: 'Search the wiki by number, title or text',
    searchPlaceholder: 'Search the wiki…',
    recent: 'Recent', random: 'Random', add: '+ Add entry', backToTop: 'Back to top',
  },
  random: {
    failed: (error: string) => `Couldn’t pick one — ${error}.`,
    empty: 'Nothing to pick from yet.',
  },
  footer: {
    cc0Before: 'Everything written here is',
    cc0After: '— public domain. Take it, quote it, or feed it to a machine; no permission or credit is needed. The byline remains to record who wrote it first.',
    privacy: 'No account is required. Raw IP addresses and user-agent strings are not stored; salted hashes are kept to prevent abuse and enforce blocks.',
    guidelines: 'Entry guidelines', source: 'Source', apiOpen: 'open, no key.',
    interfaceLanguage: 'Interface', contentLanguage: 'Entry text',
    interfaceAria: 'Interface language', contentAria: 'Preferred entry language',
    asWritten: 'As written', translatedCount: (lang: string, n: number) => `${lang} · ${n}`,
  },
  home: {
    hasImage: 'has an image',
    feedIntro: 'Recent entries and edits, newest first.',
    empty: 'Nothing written yet.',
    entryKinds: 'Entry format', categories: 'Categories', all: 'All',
    foldedEntries: (n: number) => `${n} entries`,
    bandCount: (subjects: number, subject: string, entries: number) =>
      `${subjects} ${subject} · ${entries} ${entries === 1 ? 'entry' : 'entries'}`,
  },
  browse: {
    category: 'Category', search: 'Search',
    summary: (n: number, abbr: boolean) =>
      `${n === 1 ? 'One entry explains' : `${n} entries explain`} this ${abbr ? 'abbreviation' : 'number'}.`,
    addMeaning: '+ Add another meaning',
    emptyValue: (value: string) => `Nothing filed under ${value} yet.`,
    giveMeaning: 'Give it a meaning.',
    emptyTag: (tag: string) => `Nothing tagged ${tag} yet.`,
    noMatches: (q: string) => `No matches for “${q}”. Try another word, or`,
    addNewEntry: 'add a new entry.',
  },
  post: {
    openFailed: (error: string) => `Couldn’t open this entry — ${error}.`,
    usedToSay: 'What it used to say',
    restoreHelp: 'Nothing here is lost. Restoring puts the entry back at this same address, so existing links still work.',
    language: 'Language', original: (lang?: string | null) => lang ? `Original (${lang})` : 'Original',
    showCredits: 'Show credits', hideCredits: 'Hide credits', edit: 'Edit',
    writtenBy: (name: string, when: string) => `Written by ${name} · ${when}`,
    lastEditedBy: (name: string, when: string) => `Last edited by ${name} · ${when}`,
    translationCredit: (lang: string, author: string, editor: string | null, when: string) =>
      `${lang} added by ${author}${editor ? `, last edited by ${editor}` : ''} · ${when}`,
    originalCredit: (lang?: string | null) => lang ? `Originally written in ${lang}` : 'Original version',
    editPromise: 'Anyone can edit — every version is kept, so nothing is lost.',
    noDetails: 'No details yet.', sayMeaning: 'Say what it means.', related: 'Related entries',
    editHistory: 'Edit history', current: 'current', noEdits: 'No edit history yet.',
    comments: 'Comments', nickname: 'Your nickname', saySomething: 'Say something',
    commentLimit: 'at most 300 characters', commentPlaceholder: 'What do you think?',
    posting: 'Posting…', postComment: 'Post', more: (n: number) => `${n} more`,
    noComments: 'No comments yet.', deleted: 'deleted', editedBy: (name: string) => `edited by ${name}`,
  },
  form: {
    editTitle: 'Edit entry', addTitle: 'Add an entry',
    editIntro: (owner: string) => `Anyone can edit this entry${owner ? `, including one written by ${owner}` : ''}. The version you replace stays in the history, and ${owner || 'the original author'} remains credited.`,
    addIntro: 'One entry per meaning. If 42 already exists, this joins it rather than replacing it.',
    guidelines: 'Entry guidelines', fixedValue: (noun: string) => `fixed — another ${noun} is another entry`,
    number: 'Number', abbreviation: 'Abbreviation', groupThousands: 'Use thousands separators',
    format: 'Format', autoDetect: 'Auto-detect', title: 'Title', titleHint: 'what it refers to',
    titlePlaceholder: "The Hitchhiker's Guide to the Galaxy",
    details: 'Details', detailsHint: 'optional — why this number, what it means',
    detailsPlaceholder: 'The Answer to the Ultimate Question of Life, the Universe, and Everything.',
    markdown: 'Markdown works — **bold**, *italic*, [links](https://…), lists, headings and tables. A single Enter is a line break.',
    writtenIn: 'Written in', categories: 'Categories',
    categoryHint: (n: number) => `up to ${n} — a film adapted from a book can use both`,
    newCategoryAria: 'Name a new category', newCategory: 'or name your own', add: 'Add',
    image: 'Image', imageHint: 'optional — jpg, png, gif or webp, up to 5 MB', remove: 'Remove',
    uploading: 'Uploading…', nickname: 'Your nickname', editorHint: 'recorded as the editor, not the author',
    noAccountHint: 'no account, no password', saving: 'Saving…', publishing: 'Publishing…',
    saveChanges: 'Save changes', publish: 'Publish',
    cc0: (editing: boolean) => `${editing ? 'Saving' : 'Publishing'} releases this contribution under CC0. Anyone may reuse it for any purpose without asking.`,
    history: 'History', historyHint: 'restore an earlier version at this same address', current: 'current',
    translations: 'Translations', translationsHint: 'this entry in other languages',
    editTranslation: 'Edit translation', addTranslation: '+ Add translation',
    requiredTranslation: 'A language and a title are required.',
    removeTranslationConfirm: (lang: string) => `Remove the ${lang} translation? It stays in the entry’s history.`,
    language: 'Language', languageHint: 'the language used for this translation', pickOne: 'Pick one…',
    translationTitleHint: 'the entry’s title in that language', optionalMarkdown: 'optional — markdown works here too',
    addThisTranslation: 'Add translation', removeTranslation: 'Remove translation',
    related: 'Related entries', relatedHint: 'other numbers that belong beside this one', unlink: 'Unlink',
    linkSearchAria: 'Search the wiki for an entry to link',
    linkSearchPlaceholder: 'Search the wiki — e.g. Back to the Future', searching: 'Searching…',
    search: 'Search', link: 'Link', noMatches: 'No matches.',
  },
  flag: {
    heading: 'Flag a problem', kindAria: 'What kind of problem', report: 'Something is wrong',
    remove: 'It should be removed', reportLead: 'Send a report to the moderators. The entry will remain visible.',
    removeLead: 'Ask a moderator to remove this entry. If approved, it will be hidden and can be restored.',
    reported: 'Report sent. A moderator will review it.', requested: 'Removal requested. A moderator will review it.',
    whatWrong: 'What is wrong', pickOne: 'Pick one…', details: 'Details', detailHint: 'optional, up to 1000',
    removePlaceholder: 'Why should this entry be removed?', reportPlaceholder: 'What should it say instead?',
    nickname: 'Your nickname', sending: 'Sending…', askRemoval: 'Ask for removal', reportIt: 'Report it',
  },
  reasons: {
    DUPLICATE: 'It duplicates another entry', INCORRECT: 'The information is wrong',
    NO_SOURCE: 'There is no reliable source', SOURCE: 'The source is wrong or missing',
    SPAM: 'Spam', AD: 'An advertisement', ABUSE: 'Abusive or hateful',
    COPYRIGHT: 'A copyright problem', VANDALISM: 'Vandalism', OTHER: 'Something else',
  },
  guide: { readIn: 'Read these rules in', addEntry: 'Add an entry.' },
  notFound: 'Nothing here.',
}

const KO: typeof EN = {
  siteTitle: 'Namba — 숫자의 의미를 모으는 위키',
  tagline: '숫자의 의미를 모으는 열린 위키',
  common: {
    loading: '불러오는 중…', backToIndex: '색인으로 돌아가기.', addFirst: '첫 항목 추가하기.',
    anonymous: '익명', cancel: '취소', save: '저장', edit: '수정', restore: '복원',
    by: (name: string) => `${name === 'anonymous' ? '익명' : name} 작성`,
    edited: (when: string, name?: string | null) => `${when} 수정${name ? ` · ${name === 'anonymous' ? '익명' : name}` : ''}`,
    entries: (n: number) => `항목 ${n}개`, tags: (n: number) => `태그 ${n}개`,
    subject: (abbr: boolean) => abbr ? '약어' : '숫자',
  },
  format: { INTEGER: '정수', DECIMAL: '소수', MIXED: '혼합형', TIME: '시각', ABBR: '약어' },
  buckets: {
    '1': '1 – 9', '10': '10 – 99', '100': '100 – 999',
    '1000': '1,000 – 9,999', '10000+': '10,000 이상',
  },
  header: {
    searchLabel: '숫자, 제목 또는 내용으로 위키 검색', searchPlaceholder: '위키 검색…',
    recent: '최근', random: '무작위', add: '+ 항목 추가', backToTop: '맨 위로',
  },
  random: {
    failed: (error: string) => `무작위 항목을 고르지 못했습니다 — ${error}.`,
    empty: '아직 고를 수 있는 항목이 없습니다.',
  },
  footer: {
    cc0Before: '이곳에 작성된 모든 내용은',
    cc0After: '에 따라 퍼블릭 도메인으로 공개됩니다. 허락이나 출처 표시 없이 인용하거나 재사용할 수 있습니다. 작성자 표시는 최초 작성 기록으로 남습니다.',
    privacy: '계정은 필요하지 않습니다. 원본 IP 주소와 사용자 에이전트 문자열은 저장하지 않으며, 남용 방지와 차단 적용을 위해 솔트 처리된 해시만 보관합니다.',
    guidelines: '항목 작성 지침', source: '소스 코드', apiOpen: '키 없이 공개.',
    interfaceLanguage: '화면 언어', contentLanguage: '항목 내용',
    interfaceAria: '화면 언어', contentAria: '선호하는 항목 언어', asWritten: '원문 그대로',
    translatedCount: (lang: string, n: number) => `${lang} · 번역 ${n}개`,
  },
  home: {
    hasImage: '이미지 있음', feedIntro: '최근 작성·수정된 항목부터 보여줍니다.',
    empty: '아직 작성된 항목이 없습니다.', entryKinds: '항목 형식', categories: '분류', all: '전체',
    foldedEntries: (n: number) => `항목 ${n}개`,
    bandCount: (subjects: number, subject: string, entries: number) =>
      `${subject} ${subjects}개 · 항목 ${entries}개`,
  },
  browse: {
    category: '분류', search: '검색',
    summary: (n: number, abbr: boolean) => `${abbr ? '이 약어' : '이 숫자'}를 설명하는 항목이 ${n}개 있습니다.`,
    addMeaning: '+ 다른 의미 추가', emptyValue: (value: string) => `${value}에 등록된 항목이 아직 없습니다.`,
    giveMeaning: '의미 추가하기.', emptyTag: (tag: string) => `${tag} 태그가 붙은 항목이 아직 없습니다.`,
    noMatches: (q: string) => `“${q}” 검색 결과가 없습니다. 다른 단어로 검색하거나`,
    addNewEntry: '새 항목을 추가해 보세요.',
  },
  post: {
    openFailed: (error: string) => `항목을 열지 못했습니다 — ${error}.`, usedToSay: '이전에 작성된 내용',
    restoreHelp: '내용은 사라지지 않았습니다. 복원하면 같은 주소에 항목이 다시 나타나므로 기존 링크도 그대로 작동합니다.',
    language: '언어', original: (lang?: string | null) => lang ? `원문 (${lang})` : '원문',
    showCredits: '작성 정보 보기', hideCredits: '작성 정보 숨기기', edit: '수정',
    writtenBy: (name: string, when: string) => `${name} 작성 · ${when}`,
    lastEditedBy: (name: string, when: string) => `${name} 최종 수정 · ${when}`,
    translationCredit: (lang: string, author: string, editor: string | null, when: string) =>
      `${lang} 번역: ${author}${editor ? ` · 최종 수정 ${editor}` : ''} · ${when}`,
    originalCredit: (lang?: string | null) => lang ? `${lang}로 처음 작성됨` : '최초 작성본',
    editPromise: '누구나 수정할 수 있으며 모든 버전이 기록에 남습니다.', noDetails: '아직 자세한 설명이 없습니다.',
    sayMeaning: '의미 설명하기.', related: '관련 항목', editHistory: '수정 기록', current: '현재',
    noEdits: '아직 수정 기록이 없습니다.', comments: '댓글', nickname: '닉네임',
    saySomething: '댓글 작성', commentLimit: '최대 300자', commentPlaceholder: '어떻게 생각하시나요?',
    posting: '게시 중…', postComment: '게시', more: (n: number) => `${n}개 더 보기`,
    noComments: '아직 댓글이 없습니다.', deleted: '삭제됨', editedBy: (name: string) => `${name} 수정`,
  },
  form: {
    editTitle: '항목 수정', addTitle: '항목 추가',
    editIntro: (owner: string) => `누구나 이 항목을 수정할 수 있습니다${owner ? `. 최초 작성자는 ${owner}입니다` : ''}. 교체되는 버전은 기록에 남고 ${owner || '최초 작성자'} 표시는 유지됩니다.`,
    addIntro: '하나의 항목에는 하나의 의미를 작성합니다. 42가 이미 있어도 기존 내용을 교체하지 않고 새 의미로 추가됩니다.',
    guidelines: '항목 작성 지침', fixedValue: (noun: string) => `고정됨 — 다른 ${noun}는 별도 항목으로 작성`,
    number: '숫자', abbreviation: '약어', groupThousands: '천 단위 구분 기호 사용', format: '형식',
    autoDetect: '자동 감지', title: '제목', titleHint: '무엇을 가리키는지 작성',
    titlePlaceholder: '은하수를 여행하는 히치하이커를 위한 안내서',
    details: '자세히', detailsHint: '선택 — 이 숫자인 이유와 의미',
    detailsPlaceholder: '삶, 우주, 그리고 모든 것에 대한 궁극적인 질문의 답.',
    markdown: 'Markdown을 사용할 수 있습니다 — **굵게**, *기울임*, [링크](https://…), 목록, 제목, 표. Enter 한 번은 줄바꿈으로 표시됩니다.',
    writtenIn: '작성 언어', categories: '분류',
    categoryHint: (n: number) => `최대 ${n}개 — 책을 원작으로 한 영화라면 둘 다 선택 가능`,
    newCategoryAria: '새 분류 이름', newCategory: '새 분류 직접 입력', add: '추가', image: '이미지',
    imageHint: '선택 — jpg, png, gif, webp, 최대 5 MB', remove: '제거', uploading: '업로드 중…',
    nickname: '닉네임', editorHint: '작성자가 아닌 수정자로 기록', noAccountHint: '계정과 비밀번호 없음',
    saving: '저장 중…', publishing: '게시 중…', saveChanges: '변경 내용 저장', publish: '게시',
    cc0: (editing: boolean) => `${editing ? '저장하면' : '게시하면'} 이 기여분은 CC0으로 공개됩니다. 누구나 허락 없이 어떤 목적으로든 재사용할 수 있습니다.`,
    history: '기록', historyHint: '이 주소의 이전 버전 복원', current: '현재',
    translations: '번역', translationsHint: '이 항목을 다른 언어로 작성',
    editTranslation: '번역 수정', addTranslation: '+ 번역 추가',
    requiredTranslation: '언어와 제목을 입력해야 합니다.',
    removeTranslationConfirm: (lang: string) => `${lang} 번역을 제거할까요? 항목 기록에는 남습니다.`,
    language: '언어', languageHint: '이 번역에 사용된 언어', pickOne: '선택…',
    translationTitleHint: '해당 언어로 쓴 항목 제목', optionalMarkdown: '선택 — 여기서도 Markdown 사용 가능',
    addThisTranslation: '번역 추가', removeTranslation: '번역 제거', related: '관련 항목',
    relatedHint: '함께 볼 만한 다른 숫자', unlink: '연결 해제',
    linkSearchAria: '연결할 항목 검색', linkSearchPlaceholder: '위키 검색 — 예: Back to the Future',
    searching: '검색 중…', search: '검색', link: '연결', noMatches: '검색 결과가 없습니다.',
  },
  flag: {
    heading: '문제 신고', kindAria: '문제 유형', report: '내용에 문제가 있음', remove: '내려야 하는 항목',
    reportLead: '운영자에게 내용을 신고합니다. 항목은 계속 공개됩니다.',
    removeLead: '운영자에게 항목을 내려 달라고 요청합니다. 승인되면 숨김 처리되며 다시 복원할 수 있습니다.',
    reported: '신고했습니다. 운영자가 검토합니다.', requested: '삭제를 요청했습니다. 운영자가 검토합니다.',
    whatWrong: '문제 사유', pickOne: '선택…', details: '자세히', detailHint: '선택, 최대 1000자',
    removePlaceholder: '이 항목을 내려야 하는 이유는 무엇인가요?', reportPlaceholder: '어떻게 고쳐야 하나요?',
    nickname: '닉네임', sending: '전송 중…', askRemoval: '삭제 요청', reportIt: '신고',
  },
  reasons: {
    DUPLICATE: '다른 항목과 중복됨', INCORRECT: '정보가 잘못됨', NO_SOURCE: '신뢰할 만한 출처가 없음',
    SOURCE: '출처가 잘못되었거나 없음', SPAM: '스팸', AD: '광고', ABUSE: '모욕적이거나 혐오스러움',
    COPYRIGHT: '저작권 문제', VANDALISM: '문서 훼손', OTHER: '기타',
  },
  guide: { readIn: '지침 언어', addEntry: '항목 추가하기.' },
  notFound: '페이지를 찾을 수 없습니다.',
}

const JA: typeof EN = {
  siteTitle: 'Namba — 数字の意味を集めるウィキ',
  tagline: '数字の意味を集めるオープンなウィキ',
  common: {
    loading: '読み込み中…', backToIndex: '一覧に戻る。', addFirst: '最初の項目を追加する。',
    anonymous: '匿名', cancel: 'キャンセル', save: '保存', edit: '編集', restore: '復元',
    by: (name: string) => `${name === 'anonymous' ? '匿名' : name}が作成`,
    edited: (when: string, name?: string | null) => name
      ? `${name === 'anonymous' ? '匿名' : name}が${when}に編集`
      : `${when}に編集`,
    entries: (n: number) => `${n}件`, tags: (n: number) => `${n}個のタグ`,
    subject: (abbr: boolean) => abbr ? '略語' : '数字',
  },
  format: { INTEGER: '整数', DECIMAL: '小数', MIXED: '混合', TIME: '時刻', ABBR: '略語' },
  buckets: {
    '1': '1 – 9', '10': '10 – 99', '100': '100 – 999',
    '1000': '1,000 – 9,999', '10000+': '10,000以上',
  },
  header: {
    searchLabel: '数字、タイトル、本文からウィキを検索', searchPlaceholder: 'ウィキを検索…',
    recent: '最近', random: 'ランダム', add: '+ 項目を追加', backToTop: 'ページ上部へ',
  },
  random: {
    failed: (error: string) => `項目を選べませんでした — ${error}。`,
    empty: '選べる項目がまだありません。',
  },
  footer: {
    cc0Before: 'ここに書かれたすべての内容は',
    cc0After: 'のもとでパブリックドメインとして公開されます。許可やクレジット表記なしで引用・再利用できます。作成者名は最初に書いた人の記録として残ります。',
    privacy: 'アカウントは必要ありません。IPアドレスとユーザーエージェントの原文は保存せず、不正利用の防止とブロックの適用に必要なソルト付きハッシュのみを保持します。',
    guidelines: '項目ガイドライン', source: 'ソースコード', apiOpen: 'キー不要で公開中。',
    interfaceLanguage: '表示言語', contentLanguage: '項目の本文',
    interfaceAria: '表示言語', contentAria: '項目の優先言語', asWritten: '原文のまま',
    translatedCount: (lang: string, n: number) => `${lang} · 翻訳${n}件`,
  },
  home: {
    hasImage: '画像あり', feedIntro: '最近作成・編集された項目から表示します。',
    empty: 'まだ項目がありません。', entryKinds: '項目の形式', categories: 'カテゴリ', all: 'すべて',
    foldedEntries: (n: number) => `${n}件の項目`,
    bandCount: (subjects: number, subject: string, entries: number) =>
      `${subject}${subjects}個 · 項目${entries}件`,
  },
  browse: {
    category: 'カテゴリ', search: '検索',
    summary: (n: number, abbr: boolean) => `${abbr ? 'この略語' : 'この数字'}を説明する項目が${n}件あります。`,
    addMeaning: '+ 別の意味を追加', emptyValue: (value: string) => `${value}の項目はまだありません。`,
    giveMeaning: '意味を追加する。', emptyTag: (tag: string) => `${tag}タグの項目はまだありません。`,
    noMatches: (q: string) => `「${q}」に一致する項目はありません。別の言葉で検索するか、`,
    addNewEntry: '新しい項目を追加してください。',
  },
  post: {
    openFailed: (error: string) => `項目を開けませんでした — ${error}。`, usedToSay: '以前の内容',
    restoreHelp: '内容は失われていません。復元すると同じURLに項目が戻るため、既存のリンクもそのまま使えます。',
    language: '言語', original: (lang?: string | null) => lang ? `原文（${lang}）` : '原文',
    showCredits: '作成情報を表示', hideCredits: '作成情報を隠す', edit: '編集',
    writtenBy: (name: string, when: string) => `${name}が作成 · ${when}`,
    lastEditedBy: (name: string, when: string) => `${name}が最終編集 · ${when}`,
    translationCredit: (lang: string, author: string, editor: string | null, when: string) =>
      `${lang}翻訳: ${author}${editor ? ` · 最終編集 ${editor}` : ''} · ${when}`,
    originalCredit: (lang?: string | null) => lang ? `${lang}で最初に作成` : '初版',
    editPromise: '誰でも編集でき、すべての版が履歴に残ります。', noDetails: '詳しい説明はまだありません。',
    sayMeaning: '意味を説明する。', related: '関連項目', editHistory: '編集履歴', current: '現在',
    noEdits: '編集履歴はまだありません。', comments: 'コメント', nickname: 'ニックネーム',
    saySomething: 'コメントを書く', commentLimit: '300文字まで', commentPlaceholder: 'どう思いますか？',
    posting: '投稿中…', postComment: '投稿', more: (n: number) => `さらに${n}件`,
    noComments: 'コメントはまだありません。', deleted: '削除済み', editedBy: (name: string) => `${name}が編集`,
  },
  form: {
    editTitle: '項目を編集', addTitle: '項目を追加',
    editIntro: (owner: string) => `誰でもこの項目を編集できます${owner ? `。最初の作成者は${owner}です` : ''}。置き換えられた版は履歴に残り、${owner || '最初の作成者'}のクレジットも維持されます。`,
    addIntro: '1項目につき1つの意味を記載します。42がすでに存在していても、置き換えずに新しい意味として追加されます。',
    guidelines: '項目ガイドライン', fixedValue: (noun: string) => `変更不可 — 別の${noun}は別項目として作成`,
    number: '数字', abbreviation: '略語', groupThousands: '3桁区切りを使用', format: '形式',
    autoDetect: '自動判定', title: 'タイトル', titleHint: '何を指す数字か',
    titlePlaceholder: '銀河ヒッチハイク・ガイド', details: '詳細',
    detailsHint: '任意 — なぜこの数字なのか、何を意味するのか',
    detailsPlaceholder: '生命、宇宙、そして万物についての究極の疑問の答え。',
    markdown: 'Markdownが使えます — **太字**、*斜体*、[リンク](https://…)、リスト、見出し、表。Enterを1回押すと改行されます。',
    writtenIn: '記述言語', categories: 'カテゴリ',
    categoryHint: (n: number) => `${n}個まで — 本を原作とする映画なら両方を選択可能`,
    newCategoryAria: '新しいカテゴリ名', newCategory: '新しいカテゴリを入力', add: '追加',
    image: '画像', imageHint: '任意 — jpg、png、gif、webp、5 MBまで', remove: '削除',
    uploading: 'アップロード中…', nickname: 'ニックネーム', editorHint: '作成者ではなく編集者として記録',
    noAccountHint: 'アカウント・パスワード不要', saving: '保存中…', publishing: '公開中…',
    saveChanges: '変更を保存', publish: '公開',
    cc0: (editing: boolean) => `${editing ? '保存すると' : '公開すると'}、この投稿はCC0で公開されます。誰でも許可なく、あらゆる目的に再利用できます。`,
    history: '履歴', historyHint: 'このURLの以前の版を復元', current: '現在',
    translations: '翻訳', translationsHint: 'この項目を別の言語で記述',
    editTranslation: '翻訳を編集', addTranslation: '+ 翻訳を追加',
    requiredTranslation: '言語とタイトルを入力してください。',
    removeTranslationConfirm: (lang: string) => `${lang}の翻訳を削除しますか？ 項目の履歴には残ります。`,
    language: '言語', languageHint: 'この翻訳で使用する言語', pickOne: '選択…',
    translationTitleHint: 'その言語での項目タイトル', optionalMarkdown: '任意 — ここでもMarkdownを使用可能',
    addThisTranslation: '翻訳を追加', removeTranslation: '翻訳を削除', related: '関連項目',
    relatedHint: '一緒に見るとよい別の数字', unlink: 'リンクを解除',
    linkSearchAria: 'リンクする項目を検索', linkSearchPlaceholder: 'ウィキを検索 — 例: Back to the Future',
    searching: '検索中…', search: '検索', link: 'リンク', noMatches: '一致する項目はありません。',
  },
  flag: {
    heading: '問題を報告', kindAria: '問題の種類', report: '内容に問題がある', remove: '削除すべき項目',
    reportLead: 'モデレーターに内容を報告します。項目は引き続き公開されます。',
    removeLead: 'モデレーターに項目の削除を依頼します。承認されると非表示になり、後から復元できます。',
    reported: '報告を送信しました。モデレーターが確認します。', requested: '削除を依頼しました。モデレーターが確認します。',
    whatWrong: '問題の理由', pickOne: '選択…', details: '詳細', detailHint: '任意、1000文字まで',
    removePlaceholder: 'この項目を削除すべき理由を教えてください。', reportPlaceholder: 'どのように修正すべきですか？',
    nickname: 'ニックネーム', sending: '送信中…', askRemoval: '削除を依頼', reportIt: '報告',
  },
  reasons: {
    DUPLICATE: '別の項目と重複している', INCORRECT: '情報が間違っている', NO_SOURCE: '信頼できる出典がない',
    SOURCE: '出典が間違っている、または不足している', SPAM: 'スパム', AD: '広告',
    ABUSE: '攻撃的または差別的な内容', COPYRIGHT: '著作権上の問題',
    VANDALISM: '荒らし行為', OTHER: 'その他',
  },
  guide: { readIn: 'ガイドラインの言語', addEntry: '項目を追加する。' },
  notFound: 'ページが見つかりません。',
}

const ZH_HANS: typeof EN = {
  siteTitle: 'Namba — 汇集数字含义的维基',
  tagline: '汇集数字含义的开放维基',
  common: {
    loading: '加载中…', backToIndex: '返回索引。', addFirst: '添加第一个条目。',
    anonymous: '匿名', cancel: '取消', save: '保存', edit: '编辑', restore: '恢复',
    by: (name: string) => `${name === 'anonymous' ? '匿名用户' : name}创建`,
    edited: (when: string, name?: string | null) =>
      `${when}编辑${name ? ` · ${name === 'anonymous' ? '匿名用户' : name}` : ''}`,
    entries: (n: number) => `${n}个条目`, tags: (n: number) => `${n}个标签`,
    subject: (abbr: boolean) => abbr ? '缩写' : '数字',
  },
  format: { INTEGER: '整数', DECIMAL: '小数', MIXED: '混合', TIME: '时间', ABBR: '缩写' },
  buckets: {
    '1': '1 – 9', '10': '10 – 99', '100': '100 – 999',
    '1000': '1,000 – 9,999', '10000+': '10,000以上',
  },
  header: {
    searchLabel: '按数字、标题或正文搜索维基', searchPlaceholder: '搜索维基…',
    recent: '最近', random: '随机', add: '+ 添加条目', backToTop: '返回顶部',
  },
  random: {
    failed: (error: string) => `无法选择条目 — ${error}。`,
    empty: '暂时没有可供选择的条目。',
  },
  footer: {
    cc0Before: '本站所有内容均依据',
    cc0After: '作为公共领域内容发布，无需许可或署名即可引用和再利用。作者署名仍会保留，用于记录最初的创作者。',
    privacy: '无需注册账号。我们不会存储原始IP地址或用户代理字符串，仅保留加盐哈希，用于防止滥用和执行封禁。',
    guidelines: '条目指南', source: '源代码', apiOpen: '开放使用，无需密钥。',
    interfaceLanguage: '界面语言', contentLanguage: '条目内容',
    interfaceAria: '界面语言', contentAria: '条目内容的首选语言', asWritten: '按原文显示',
    translatedCount: (lang: string, n: number) => `${lang} · ${n}篇译文`,
  },
  home: {
    hasImage: '包含图片', feedIntro: '按最近创建或编辑的时间排序。',
    empty: '还没有任何条目。', entryKinds: '条目格式', categories: '分类', all: '全部',
    foldedEntries: (n: number) => `${n}个条目`,
    bandCount: (subjects: number, subject: string, entries: number) =>
      `${subjects}个${subject} · ${entries}个条目`,
  },
  browse: {
    category: '分类', search: '搜索',
    summary: (n: number, abbr: boolean) => `共有${n}个条目解释${abbr ? '这个缩写' : '这个数字'}。`,
    addMeaning: '+ 添加另一种含义', emptyValue: (value: string) => `${value}下还没有条目。`,
    giveMeaning: '添加一种含义。', emptyTag: (tag: string) => `还没有带有${tag}标签的条目。`,
    noMatches: (q: string) => `没有与“${q}”匹配的结果。请尝试其他关键词，或`,
    addNewEntry: '添加一个新条目。',
  },
  post: {
    openFailed: (error: string) => `无法打开此条目 — ${error}。`, usedToSay: '以前的内容',
    restoreHelp: '内容并未丢失。恢复后，条目会重新出现在同一地址，原有链接仍然有效。',
    language: '语言', original: (lang?: string | null) => lang ? `原文（${lang}）` : '原文',
    showCredits: '显示创作信息', hideCredits: '隐藏创作信息', edit: '编辑',
    writtenBy: (name: string, when: string) => `${name}创建 · ${when}`,
    lastEditedBy: (name: string, when: string) => `${name}最后编辑 · ${when}`,
    translationCredit: (lang: string, author: string, editor: string | null, when: string) =>
      `${lang}翻译：${author}${editor ? ` · 最后编辑 ${editor}` : ''} · ${when}`,
    originalCredit: (lang?: string | null) => lang ? `最初以${lang}写成` : '初始版本',
    editPromise: '任何人都可以编辑，所有版本都会保留在历史记录中。', noDetails: '还没有详细说明。',
    sayMeaning: '说明它的含义。', related: '相关条目', editHistory: '编辑历史', current: '当前',
    noEdits: '还没有编辑记录。', comments: '评论', nickname: '昵称',
    saySomething: '发表评论', commentLimit: '最多300个字符', commentPlaceholder: '你有什么看法？',
    posting: '发布中…', postComment: '发布', more: (n: number) => `再显示${n}条`,
    noComments: '还没有评论。', deleted: '已删除', editedBy: (name: string) => `${name}编辑`,
  },
  form: {
    editTitle: '编辑条目', addTitle: '添加条目',
    editIntro: (owner: string) => `任何人都可以编辑此条目${owner ? `。最初的创建者是${owner}` : ''}。被替换的版本会保留在历史记录中，${owner || '最初创建者'}的署名也会保留。`,
    addIntro: '每个条目只记录一个含义。即使42已经存在，新内容也会作为另一种含义加入，而不会替换原条目。',
    guidelines: '条目指南', fixedValue: (noun: string) => `不可更改 — 另一个${noun}应创建为单独条目`,
    number: '数字', abbreviation: '缩写', groupThousands: '使用千位分隔符', format: '格式',
    autoDetect: '自动检测', title: '标题', titleHint: '它指的是什么',
    titlePlaceholder: '银河系漫游指南', details: '详细说明',
    detailsHint: '可选 — 为什么是这个值，它代表什么',
    detailsPlaceholder: '生命、宇宙以及一切终极问题的答案。',
    markdown: '支持Markdown — **粗体**、*斜体*、[链接](https://…)、列表、标题和表格。按一次Enter即可换行。',
    writtenIn: '写作语言', categories: '分类',
    categoryHint: (n: number) => `最多${n}个 — 由图书改编的电影可以同时选择两者`,
    newCategoryAria: '新分类名称', newCategory: '输入新分类', add: '添加',
    image: '图片', imageHint: '可选 — jpg、png、gif或webp，最大5 MB', remove: '移除',
    uploading: '上传中…', nickname: '昵称', editorHint: '记录为编辑者，而非原作者',
    noAccountHint: '无需账号和密码', saving: '保存中…', publishing: '发布中…',
    saveChanges: '保存更改', publish: '发布',
    cc0: (editing: boolean) => `${editing ? '保存后' : '发布后'}，这份贡献将以CC0发布。任何人都可以不经许可将其用于任何用途。`,
    history: '历史记录', historyHint: '恢复此地址下的早期版本', current: '当前',
    translations: '翻译', translationsHint: '使用其他语言编写此条目',
    editTranslation: '编辑翻译', addTranslation: '+ 添加翻译',
    requiredTranslation: '请选择语言并填写标题。',
    removeTranslationConfirm: (lang: string) => `要移除${lang}翻译吗？它仍会保留在条目历史记录中。`,
    language: '语言', languageHint: '此翻译所使用的语言', pickOne: '请选择…',
    translationTitleHint: '使用该语言填写条目标题', optionalMarkdown: '可选 — 此处也支持Markdown',
    addThisTranslation: '添加翻译', removeTranslation: '移除翻译', related: '相关条目',
    relatedHint: '适合与此条目一同查看的其他数字', unlink: '取消关联',
    linkSearchAria: '搜索要关联的条目', linkSearchPlaceholder: '搜索维基 — 例如：Back to the Future',
    searching: '搜索中…', search: '搜索', link: '关联', noMatches: '没有匹配的结果。',
  },
  flag: {
    heading: '报告问题', kindAria: '问题类型', report: '内容有误', remove: '应当移除',
    reportLead: '将内容问题报告给管理员。此条目会继续保持公开。',
    removeLead: '请求管理员移除此条目。批准后条目会被隐藏，并且可以恢复。',
    reported: '报告已发送，管理员会进行审核。', requested: '移除请求已发送，管理员会进行审核。',
    whatWrong: '问题原因', pickOne: '请选择…', details: '详细说明', detailHint: '可选，最多1000个字符',
    removePlaceholder: '为什么应当移除此条目？', reportPlaceholder: '应当如何修改？',
    nickname: '昵称', sending: '发送中…', askRemoval: '请求移除', reportIt: '提交报告',
  },
  reasons: {
    DUPLICATE: '与其他条目重复', INCORRECT: '信息有误', NO_SOURCE: '没有可靠来源',
    SOURCE: '来源错误或缺失', SPAM: '垃圾内容', AD: '广告', ABUSE: '攻击性或仇恨内容',
    COPYRIGHT: '版权问题', VANDALISM: '恶意破坏', OTHER: '其他问题',
  },
  guide: { readIn: '指南语言', addEntry: '添加条目。' },
  notFound: '找不到此页面。',
}

const ES: typeof EN = {
  siteTitle: 'Namba — una wiki sobre números',
  tagline: 'Una wiki abierta sobre números',
  common: {
    loading: 'Cargando…', backToIndex: 'Volver al índice.', addFirst: 'Añade la primera entrada.',
    anonymous: 'anónimo', cancel: 'Cancelar', save: 'Guardar', edit: 'editar', restore: 'Restaurar',
    by: (name: string) => `por ${name === 'anonymous' ? 'anónimo' : name}`,
    edited: (when: string, name?: string | null) =>
      `editado ${when}${name ? ` por ${name === 'anonymous' ? 'anónimo' : name}` : ''}`,
    entries: (n: number) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`,
    tags: (n: number) => `${n} ${n === 1 ? 'etiqueta' : 'etiquetas'}`,
    subject: (abbr: boolean, n = 1) => abbr
      ? (n === 1 ? 'abreviatura' : 'abreviaturas')
      : n === 1 ? 'número' : 'números',
  },
  format: {
    INTEGER: 'Entero', DECIMAL: 'Decimal', MIXED: 'Mixto', TIME: 'Hora', ABBR: 'Abreviatura',
  },
  buckets: {
    '1': '1 – 9', '10': '10 – 99', '100': '100 – 999',
    '1000': '1.000 – 9.999', '10000+': '10.000 o más',
  },
  header: {
    searchLabel: 'Buscar en la wiki por número, título o texto', searchPlaceholder: 'Buscar en la wiki…',
    recent: 'Recientes', random: 'Al azar', add: '+ Añadir entrada', backToTop: 'Volver arriba',
  },
  random: {
    failed: (error: string) => `No se pudo elegir una entrada — ${error}.`,
    empty: 'Aún no hay entradas entre las que elegir.',
  },
  footer: {
    cc0Before: 'Todo lo escrito aquí se publica bajo',
    cc0After: '— es de dominio público. Puedes copiarlo, citarlo o reutilizarlo sin permiso ni atribución. La autoría se conserva para registrar quién lo escribió primero.',
    privacy: 'No necesitas una cuenta. No guardamos direcciones IP ni cadenas de agente de usuario sin procesar; solo conservamos hashes con sal para evitar abusos y aplicar bloqueos.',
    guidelines: 'Guía para las entradas', source: 'Código fuente', apiOpen: 'abierta y sin clave.',
    interfaceLanguage: 'Idioma de la interfaz', contentLanguage: 'Contenido de las entradas',
    interfaceAria: 'Idioma de la interfaz', contentAria: 'Idioma preferido de las entradas',
    asWritten: 'Texto original',
    translatedCount: (lang: string, n: number) => `${lang} · ${n} ${n === 1 ? 'traducción' : 'traducciones'}`,
  },
  home: {
    hasImage: 'con imagen', feedIntro: 'Entradas y ediciones recientes, de más nuevas a más antiguas.',
    empty: 'Aún no hay entradas.', entryKinds: 'Formato de la entrada', categories: 'Categorías', all: 'Todas',
    foldedEntries: (n: number) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`,
    bandCount: (subjects: number, subject: string, entries: number) =>
      `${subjects} ${subject} · ${entries} ${entries === 1 ? 'entrada' : 'entradas'}`,
  },
  browse: {
    category: 'Categoría', search: 'Búsqueda',
    summary: (n: number, abbr: boolean) =>
      `${n === 1 ? 'Una entrada explica' : `${n} entradas explican`} ${abbr ? 'esta abreviatura' : 'este número'}.`,
    addMeaning: '+ Añadir otro significado',
    emptyValue: (value: string) => `Aún no hay entradas para ${value}.`,
    giveMeaning: 'Añade un significado.', emptyTag: (tag: string) => `Aún no hay entradas con la etiqueta ${tag}.`,
    noMatches: (q: string) => `No hay resultados para «${q}». Prueba con otra palabra o`,
    addNewEntry: 'añade una entrada nueva.',
  },
  post: {
    openFailed: (error: string) => `No se pudo abrir esta entrada — ${error}.`,
    usedToSay: 'Contenido anterior',
    restoreHelp: 'Aquí no se pierde nada. Al restaurarla, la entrada vuelve a aparecer en esta misma dirección y los enlaces existentes siguen funcionando.',
    language: 'Idioma', original: (lang?: string | null) => lang ? `Original (${lang})` : 'Original',
    showCredits: 'Mostrar autoría', hideCredits: 'Ocultar autoría', edit: 'Editar',
    writtenBy: (name: string, when: string) => `Escrito por ${name} · ${when}`,
    lastEditedBy: (name: string, when: string) => `Última edición de ${name} · ${when}`,
    translationCredit: (lang: string, author: string, editor: string | null, when: string) =>
      `${lang}: traducción de ${author}${editor ? `, última edición de ${editor}` : ''} · ${when}`,
    originalCredit: (lang?: string | null) => lang ? `Escrito originalmente en ${lang}` : 'Versión original',
    editPromise: 'Cualquiera puede editar; se conservan todas las versiones para que nada se pierda.',
    noDetails: 'Aún no hay detalles.', sayMeaning: 'Explica qué significa.', related: 'Entradas relacionadas',
    editHistory: 'Historial de ediciones', current: 'actual', noEdits: 'Aún no hay ediciones.',
    comments: 'Comentarios', nickname: 'Tu alias', saySomething: 'Escribe un comentario',
    commentLimit: 'máximo 300 caracteres', commentPlaceholder: '¿Qué opinas?',
    posting: 'Publicando…', postComment: 'Publicar', more: (n: number) => `${n} más`,
    noComments: 'Aún no hay comentarios.', deleted: 'eliminado', editedBy: (name: string) => `editado por ${name}`,
  },
  form: {
    editTitle: 'Editar entrada', addTitle: 'Añadir una entrada',
    editIntro: (owner: string) => `Cualquiera puede editar esta entrada${owner ? `, aunque la haya escrito ${owner}` : ''}. La versión reemplazada permanece en el historial y ${owner || 'el autor original'} conserva la autoría.`,
    addIntro: 'Una entrada por significado. Si 42 ya existe, esta entrada se añade como otro significado en lugar de reemplazarlo.',
    guidelines: 'Guía para las entradas', fixedValue: (noun: string) => `fijo — otro ${noun} requiere otra entrada`,
    number: 'Número', abbreviation: 'Abreviatura', groupThousands: 'Usar separadores de miles',
    format: 'Formato', autoDetect: 'Detectar automáticamente', title: 'Título', titleHint: 'a qué se refiere',
    titlePlaceholder: 'Guía del autoestopista galáctico', details: 'Detalles',
    detailsHint: 'opcional — por qué es este valor y qué significa',
    detailsPlaceholder: 'La respuesta a la pregunta definitiva sobre la vida, el universo y todo lo demás.',
    markdown: 'Puedes usar Markdown: **negrita**, *cursiva*, [enlaces](https://…), listas, títulos y tablas. Una sola pulsación de Enter crea un salto de línea.',
    writtenIn: 'Escrito en', categories: 'Categorías',
    categoryHint: (n: number) => `hasta ${n} — una película basada en un libro puede usar ambas`,
    newCategoryAria: 'Nombre de una categoría nueva', newCategory: 'o crea una categoría', add: 'Añadir',
    image: 'Imagen', imageHint: 'opcional — jpg, png, gif o webp, hasta 5 MB', remove: 'Eliminar',
    uploading: 'Subiendo…', nickname: 'Tu alias', editorHint: 'constará como editor, no como autor',
    noAccountHint: 'sin cuenta ni contraseña', saving: 'Guardando…', publishing: 'Publicando…',
    saveChanges: 'Guardar cambios', publish: 'Publicar',
    cc0: (editing: boolean) => `Al ${editing ? 'guardar' : 'publicar'}, esta contribución se libera bajo CC0. Cualquiera puede reutilizarla para cualquier fin sin pedir permiso.`,
    history: 'Historial', historyHint: 'restaura una versión anterior en esta misma dirección', current: 'actual',
    translations: 'Traducciones', translationsHint: 'esta entrada en otros idiomas',
    editTranslation: 'Editar traducción', addTranslation: '+ Añadir traducción',
    requiredTranslation: 'El idioma y el título son obligatorios.',
    removeTranslationConfirm: (lang: string) => `¿Quieres eliminar la traducción en ${lang}? Permanecerá en el historial de la entrada.`,
    language: 'Idioma', languageHint: 'idioma de esta traducción', pickOne: 'Elige uno…',
    translationTitleHint: 'título de la entrada en este idioma', optionalMarkdown: 'opcional — también puedes usar Markdown aquí',
    addThisTranslation: 'Añadir traducción', removeTranslation: 'Eliminar traducción',
    related: 'Entradas relacionadas', relatedHint: 'otros números que conviene consultar junto a este', unlink: 'Desvincular',
    linkSearchAria: 'Buscar en la wiki una entrada para vincular',
    linkSearchPlaceholder: 'Buscar en la wiki — p. ej., Regreso al futuro', searching: 'Buscando…',
    search: 'Buscar', link: 'Vincular', noMatches: 'No hay resultados.',
  },
  flag: {
    heading: 'Avisar de un problema', kindAria: 'Tipo de problema', report: 'Hay un error',
    remove: 'Debe eliminarse', reportLead: 'Envía un aviso a los moderadores. La entrada seguirá visible.',
    removeLead: 'Pide a un moderador que elimine esta entrada. Si se aprueba, se ocultará y podrá restaurarse.',
    reported: 'Aviso enviado. Un moderador lo revisará.', requested: 'Solicitud de eliminación enviada. Un moderador la revisará.',
    whatWrong: 'Cuál es el problema', pickOne: 'Elige uno…', details: 'Detalles', detailHint: 'opcional, hasta 1000 caracteres',
    removePlaceholder: '¿Por qué debería eliminarse esta entrada?', reportPlaceholder: '¿Qué debería decir en su lugar?',
    nickname: 'Tu alias', sending: 'Enviando…', askRemoval: 'Solicitar eliminación', reportIt: 'Enviar aviso',
  },
  reasons: {
    DUPLICATE: 'Duplica otra entrada', INCORRECT: 'La información es incorrecta',
    NO_SOURCE: 'No hay una fuente fiable', SOURCE: 'La fuente es incorrecta o falta',
    SPAM: 'Contenido no deseado', AD: 'Publicidad', ABUSE: 'Contenido ofensivo o que incita al odio',
    COPYRIGHT: 'Problema de derechos de autor', VANDALISM: 'Vandalismo', OTHER: 'Otro problema',
  },
  guide: { readIn: 'Idioma de la guía', addEntry: 'Añadir una entrada.' },
  notFound: 'No hay nada aquí.',
}

const MESSAGES = { en: EN, ko: KO, ja: JA, 'zh-Hans': ZH_HANS, es: ES }

const UI_KEY = 'namba.uiLocale'
export const uiLocale = {
  get: (): UiLocale => {
    const saved = localStorage.getItem(UI_KEY)
    if (saved === 'en' || saved === 'ko' || saved === 'ja' || saved === 'zh-Hans' || saved === 'es') return saved
    const browser = navigator.language.toLowerCase()
    if (browser.startsWith('ko')) return 'ko'
    if (browser.startsWith('ja')) return 'ja'
    if (browser.startsWith('zh')) return 'zh-Hans'
    if (browser.startsWith('es')) return 'es'
    return 'en'
  },
  set: (locale: UiLocale) => localStorage.setItem(UI_KEY, locale),
}

type UiContextValue = {
  locale: UiLocale
  setLocale: (locale: UiLocale) => void
  m: typeof EN
}

const UiContext = createContext<UiContextValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(uiLocale.get)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = 'ltr'
  }, [locale])

  function setLocale(next: UiLocale) {
    uiLocale.set(next)
    setLocaleState(next)
  }

  return (
    <UiContext value={{ locale, setLocale, m: MESSAGES[locale] }}>
      {children}
    </UiContext>
  )
}

export function useUi() {
  const value = useContext(UiContext)
  if (!value) throw new Error('useUi must be used inside UiProvider')
  return value
}
