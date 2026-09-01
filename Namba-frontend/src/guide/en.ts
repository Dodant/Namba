import type { GuideDoc } from './outline'

/* The guide as written, and the one every translation is measured against.
   When a rule changes it changes here first and the version goes up; a
   translation still on the old number says so at the top of itself.

   One claim to a paragraph, and the reason said out loud rather than folded
   into the clause that makes the claim. The older draft of this file wrote
   tighter than that -- a rule and its argument in one sentence, with the
   second half left for the reader to hear -- and it read well and answered
   badly. Somebody arrives here because an entry of theirs was questioned, and
   a rule that has to be unpacked to be understood is a rule they will not
   agree they broke. The Korean was rewritten this way first; this is the same
   pass run on the document it is a translation of, so the two say the same
   thing at the same length in the same order. */
const en: GuideDoc = {
  version: '0.3',
  updated: '2026-09-01',
  title: 'Entry guidelines',
  lede: `Namba is a **wiki of what numbers mean**. It is not a record of every
place a number turns up.

One entry is **one meaning of one number**. It is not enough that a number sits
beside something; the number itself has to be the thing there is something to
explain about.

Anyone may write an entry and anyone may edit one, and nothing is reviewed
before it goes up. This page is what stands where a review would: it is where
the wiki says what may be filed in it.`,
  columns: ['An entry', 'Not an entry'],
  stale:
    'This translation is at v{mine}; the English guide is at v{base}. Where ' +
    'the two differ, the English one is the rule.',
  sections: {
    terms: {
      heading: 'Terms',
      body: `**Entry.** One meaning of one number. One person writes it, and
after it is published anyone may edit it. An entry is what Add makes, and every
rule on this page is a rule about an entry.

**Number page.** \`/n/42\` is not itself an entry. It is the page that gathers
every entry filed under 42. No number belongs to anybody, so filing a new
meaning under 42 does not replace what is already there — the new entry joins
it under the same number.

**Value.** The identifier that tells one entry from another: \`42\`, \`3.14\`,
\`11:11\`, \`11/22/63\`, \`UFO\`. The value settles the address and cannot be
changed after publishing. A different value belongs to a different page.

**Format.** What kind of thing the value is read as: integer, decimal, mixed,
time or abbreviation. The format decides how a value sorts and where it is
answered — the abbreviation \`UFO\` is read at \`/a/UFO\` and the number \`42\`
at \`/n/42\`.`,
    },

    test: {
      heading: 'Inclusion test',
      body: `Ask this one first.

**Could the same rule produce a hundred more entries like it?**

If it could, what you have is more likely a **series or a list** than a meaning.
Every rule below is this question asked about one kind of thing.

When the answer is close, there is another way to ask it.

**Would the same kind of meaning survive if the number were swapped?**

Change the 42 in *The Hitchhiker's Guide to the Galaxy* and the joke the book is
known for is gone.

Change the 3 in *GTA 3* to a 4 and you have *GTA 4*. A different game, and the
number is doing exactly the same job. Both of them only count where the game
falls in the series.`,
    },

    'the-point': {
      heading: '1. The number has to carry the meaning',
      body: `A number qualifies when it is part of what the thing is. It is
named in the work, or it stands for an idea, or people recognise the thing by
the number itself.

- **A number in a work.** 42 in *The Hitchhiker's Guide to the Galaxy*, 237 in
  *The Shining*, 10:04 PM in *Back to the Future*, 626 for Stitch.
- **A number that stands for something.** 404 for Not Found, 23 for the
  birthday paradox, three for the Trinity, a cat's nine lives, cloud nine. A
  number one culture treats as charged counts too — 4 across Korea, Japan and
  China, 13 in the English-speaking world.
- **A constant or a measurement.** 299,792,458 m/s, 42.195 km, 3.14, 273.15 K.
  Here the number is not a reference to the fact. The number is the fact.
- **A number that became part of a name.** Porsche 911, Roland 808, Chanel N°5,
  Sherlock Holmes at 221B. Take the number away and you can no longer say what
  the thing is called.

Turning up somewhere is not enough on its own.

A clock reading \`10:03\` in the background of a scene is not an entry. The
\`10:04 PM\` in *Back to the Future* is, because it has a part to play in the
story.`,
    },

    sequences: {
      heading: '2. Sequence, edition and year numbers are out',
      body: `Season 2, *GTA 3*, the 2022 World Cup, iPhone 15, Super Bowl 52,
Episode 4.

Almost always these numbers only mark **an order, an edition, a generation or
the year it was held**. They carry no meaning the number before them did not.

What matters is whether the number is **inside the thing, or fixed to the
outside of it to keep count**.

The nine in *District 9* is a district that exists in the film.

The three in *GTA 3* records that this is the third game in the series. Nothing
inside the game is three.

**The exception is a number that outgrew the series and took on a meaning of its
own.**

Apollo 11 is remembered as the first landing on the moon, and Apollo 13 as the
mission whose crew came home after an accident. What matters is not that they
are the eleventh and the thirteenth, but that each number earned a history of
its own.

Area 51, AK-47, Experiment 626 and Earth-616 are the same shape. Each began as a
serial number or an identifier, and over time the number itself settled into
being a name.

When it is hard to call, ask it backwards.

**Could 10, 11, 12 and 13 all be entries for the same reason?**

If the reason is only "it is the next one in the series", then none of them
qualifies.

The reason this rule exists is simple: [the number index](/) is what this wiki
is built around. Without the limit, \`/n/1\` through \`/n/30\` would fill up with
nothing but "Season N of —".`,
    },

    mining: {
      heading: '3. Do not mine a source for numbers',
      body: `A single film has hundreds of numbers in it. Do not read a work end
to end and file every number you see.

A number taken from a work has to be at least one of these.

- It is a device in the plot.
- It comes back more than once.
- It decides an event or an outcome.
- It is tied to a particular character's identity.
- It is known outside the work as a number that stands for it.

Room 237 in *The Shining* meets several of these at once.

A receipt in the same film happening to read \`$23.70\` meets none of them.

**Working through one source to file numbers in bulk, to raise a count, is
treated as spam.**

That covers a film, a brand's whole product line, a sports database and a
historical timeline.

A good wiki of numbers is not the one with the most numbers in it. It is **the
one where every number has something worth explaining**.`,
    },

    why: {
      heading: '4. Explain why that number',
      body: `\`33 — Santal 33\`

This has only matched a number to a name.

Whereas

\`33 — Santal 33, for the thirty-three ingredients in the formula\`

explains why the number 33 is attached to it at all.

Namba is not an index pairing numbers with names. It is a **wiki that records
the meanings and the stories attached to numbers**.

Numbers being the subject, accuracy matters too.

Check the units, the decimal point, the date, the notation, and what the number
actually stands for.

\`9.81 — gravity\`

is less accurate than

\`9.81 m/s² — gravitational acceleration near Earth's surface\`

There is nothing wrong with the explanation running a little longer.`,
    },

    never: {
      heading: 'Never eligible',
      body: `- **Somebody's private number.** A phone number, an account number,
  an ID number, the street address of a place someone actually lives, a living
  person's date of birth. Making numbers easy to find is the whole of what
  Namba does, which is exactly why personal information needs particular care
  here.
- **A number flown as a symbol rather than explained.** Numbers a political or
  social movement uses as a badge — 14, 88 — may be recorded when the purpose
  is to explain their historical and cultural meaning. An entry written to
  endorse the symbol, or to signal with it, is not allowed.
- **Somebody else's writing.** Everything published here is released as
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Write only what
  you have the right to release. You may draw on a source and link to it, but
  you may not copy someone else's text across.
- **Advertisements.** An entry written to steer readers to a product or a
  service you are selling or promoting is not allowed.`,
    },

    'what-happens': {
      heading: 'Enforcement',
      body: `Noticing an entry that breaks a rule does not let the person who
noticed delete it.

There is no delete button for ordinary readers anywhere in Namba, and the API
does not accept a delete request either. On a wiki anyone can write to, a wiki
where anyone can erase somebody else's record is a wiki that cannot hold on to
anything.

There is also no review before the fact. What you write is public the moment you
press Publish.

An entry with a problem is handled in this order.

- **Edit it.** Most problems are better solved by an edit than by a removal. If
  you find a wrong explanation or a missing piece, you can correct it yourself.
  The record of the first writer survives the edit.
- **Flag it.** Every entry carries a flag for reporting a problem with its
  content, and for asking that the entry be taken down. A takedown request
  takes a nickname, so that one request can be told from another.
- **An operator hides it.** An operator may hide an entry they judge to be a
  problem, and it drops out of the public lists and pages. Hiding is
  reversible, so a wrong call can be put back exactly as it was.

A hard delete is carried out by an operator only where a removal is required,
such as by law. It is not a tool for routine moderation or for settling a
dispute, and data that has been hard-deleted is not recovered.`,
    },

    'by-subject': {
      heading: 'Criteria by subject',
      body: `Nothing below adds a new rule.

These are the principles above applied to films, science, technology, brands and
the rest, one subject at a time. Use them when a call is hard to make.`,
    },

    works: {
      heading: 'Films, books, games',
      rows: [
        [
          "42 — *The Hitchhiker's Guide to the Galaxy*",
          '*Toy Story 3* — the three marks the place in the series',
        ],
        ['237 — the room number in *The Shining*', '$23.70 on a receipt in the same film'],
        ['451 — *Fahrenheit 451*, where paper starts to burn', 'a taxi number seen once and never again'],
        ['300 — the Spartans at Thermopylae', 'Episode 4, Season 2, Volume 7'],
        ["1984 — George Orwell's *1984*", 'simply the year a film came out'],
      ],
      note: `A number in the title of a work is the hardest call of all.

The standard is the same as everywhere else.

**Is the number the meaning of the work itself, or a number fixed to the outside
of it to tell one work from another?**

The numbers in *Se7en*, *The Number 23*, *2001: A Space Odyssey* and *2046* are
tied directly to the title and to what the work is about.

The IV in *Rocky IV* marks the place in the series.`,
    },

    dates: {
      heading: 'Dates and times',
      rows: [
        [
          "11/22/63 — the day Kennedy was killed, and the title of Stephen King's novel",
          'the date a film opened',
        ],
        ['11:11 — *Us*, and Jeremiah 11:11', 'a time glimpsed in one scene'],
        ['09:41 — the time used on every iPhone in an Apple photograph', "a living person's birthday"],
        ['29 February — the leap day', 'the date of an event with no particular meaning'],
      ],
    },

    science: {
      heading: 'Science and measurement',
      rows: [
        ['3.14, 2.718, 1.618', 'a coefficient used in one paper only'],
        ['299,792,458 m/s — the speed of light', 'a reading from a single experiment'],
        ['273.15 K, 101,325 Pa', 'a tolerance off a particular datasheet'],
        ['42.195 km — the marathon distance', 'an arbitrary figure with almost no meaning outside its field'],
      ],
    },

    tech: {
      heading: 'Ports, protocols and standards',
      rows: [
        ['22, 80, 443 — SSH, HTTP, HTTPS', '49152 — a port one project picked arbitrarily'],
        ['3306, 5432, 6379, 27017', 'an internal build number or ticket number'],
        ['404 — Not Found', 'a status code used by one service only'],
        ['802.11, H.264, SHA-256', 'a number that only marks the version'],
      ],
    },

    brands: {
      heading: 'Brands and products',
      rows: [
        ['Chanel N°5, Porsche 911', 'Galaxy S24, iPhone 17, PlayStation 5'],
        ['Santal 33, Another 13, 59FIFTY', 'a model number that marks the generation'],
        ['Baskin-Robbins 31, AK-47', 'the meaningless product code ABC-4382'],
      ],
    },

    people: {
      heading: 'People and their numbers',
      rows: [
        ['23 — Michael Jordan', "every player's shirt number"],
        [
          '42 — Jackie Robinson, retired across MLB',
          'a number whose only claim is that somebody famous once wore it',
        ],
        ['007 — James Bond', 'a private identifying number assigned to a real person'],
      ],
    },

    places: {
      heading: 'Addresses and rooms',
      rows: [
        ['221B Baker Street', 'apartment 502, visited once in a work'],
        ['742 Evergreen Terrace', 'the street address where a real person lives now'],
        ['31 Spooner Street, 177A Bleecker Street', 'a licence plate glimpsed in one shot'],
      ],
    },

    internet: {
      heading: 'Internet culture',
      rows: [
        ['34 — Rule 34', 'a meme that ran briefly on one server'],
        ['420, 1337, 666, 777, 69', 'a joke that only lands in one comment section or one small community'],
      ],
    },

    writing: { heading: 'Writing an entry' },

    many: {
      heading: 'One number can hold several meanings',
      body: `No single entry has a number to itself.

42 can hold *The Hitchhiker's Guide to the Galaxy*, Jackie Robinson and other
meanings besides, and each of them is its own entry.

\`/n/42\` is the page that gathers those entries in one place.

So an entry already existing for 42 does not stop you filing a new one. The new
meaning joins the same number rather than replacing what was there.`,
    },

    duplicates: {
      heading: 'Do not file the same fact twice',
      body: `These three are not separate entries.

- \`42 — Jackie Robinson\`
- \`42 — Jackie Robinson's jersey number\`
- \`42 — retired across MLB\`

They are all part of one fact.

A single entry can say it like this.

*Jackie Robinson wore 42, and the number was later retired across the whole of
Major League Baseball.*

If you know something an existing entry does not say, edit that entry rather
than making a new one.

If a duplicate is already there, merge the content into one and flag what is
left over as a duplicate.`,
    },

    boxes: {
      heading: 'Form fields',
      body: `The form has few fields, and that is deliberate.

The **value** and the **format** decide the address of the page. The number 42
is shown at \`/n/42\`, and the abbreviation UFO at \`/a/UFO\`.

The **title** says in a few words what the number refers to.

The **details** box takes everything else. It accepts Markdown, and the story
behind the number, the working, the explanation and links to sources all go
here.

There is no separate field for a source. Instead, an entry that needs backing
and has none can be flagged for exactly that.

**Tags** are free-form and lower-case. Where a suitable tag already exists, use
it rather than coining a near-duplicate.

Your **nickname** is a byline for attribution. It is not a user account.`,
    },

    four: {
      heading: 'Summary',
      body: `A good entry has these four.

- **A meaning.** There is something worth explaining, and the number is at the
  centre of it.
- **Recognition.** The tie between the number and the subject exists somewhere
  beyond the writer's own head.
- **An end.** It is not one of a series that goes on forever the same way.
- **A reason to click.** Somebody who reads the entry comes away knowing **why
  that number and not another one**.`,
    },
  },
}

export default en
