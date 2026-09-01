import type { GuideDoc } from './outline'

/* The guide as written, and the one every translation is measured against.
   When a rule changes it changes here first and the version goes up; a
   translation still on the old number says so at the top of itself. */
const en: GuideDoc = {
  version: '0.3',
  updated: '2026-09-01',
  title: 'Entry guidelines',
  lede:
    'Namba is a wiki of what numbers mean — not a list of every place a number ' +
    'turns up. An entry is one meaning of one number, and the meaning has to ' +
    'belong to the number rather than sit next to it. Anyone may write one and ' +
    'anyone may correct it, and nothing is reviewed before it goes up, so this ' +
    'page is what stands where a review would.',
  stale:
    'This translation is at v{mine}; the English guide is at v{base}. Where ' +
    'the two differ, the English one is the rule.',
  sections: {
    terms: {
      heading: 'Terms',
      body: `**Entry.** One meaning of one number, written by one person and open to
everyone after that. It is what Add makes, and it is what the rest of this page
is about.

**Number page.** \`/n/42\` is not an entry — it is every entry filed under 42,
listed together. A number here is a column and not a page somebody owns, so a
new entry for 42 joins that page rather than replacing what is on it.

**Value.** The number itself, as stored: \`42\`, \`3.14\`, \`11:11\`,
\`11/22/63\`, \`UFO\`. It settles the address and cannot be retyped
afterwards — a different value is a different page, and so a different entry.

**Format.** How the value is read: integer, decimal, mixed, time or
abbreviation. It is the one thing that decides how a value is sorted and where
it is answered, which is why an abbreviation is read at \`/a/UFO\` and a number
at \`/n/42\`.`,
    },

    test: {
      heading: 'Inclusion test',
      body: `**Could the same rule produce a hundred more entries?** If it could, what
you have is a series rather than a meaning. Every rule under this one is that
question asked about a particular kind of thing.

When it is close, ask the other one: **would the meaning survive if the number
were swapped?** Change the 42 in *The Hitchhiker's Guide* and the joke is gone.
Change the 3 in *GTA 3* and you have *GTA 4* — a different game, and the same
kind of number.`,
    },

    'the-point': {
      heading: '1. Numbers that carry the meaning',
      body: `A number belongs when it is part of what the thing is — printed in its title,
spoken in its text, or standing for something people already recognise.

- **In a work.** 42 in *The Hitchhiker's Guide to the Galaxy*. 237 in *The
  Shining*. 10:04 PM in *Back to the Future*. 626 for Stitch.
- **Standing for something.** 404 for Not Found. 23 for the birthday paradox.
  Three for the Trinity, nine lives, cloud nine. 4 is the unlucky one across
  Korea, Japan and China for the same kind of reason 13 is here.
- **A constant or a measurement.** 299792458 m/s. 42.195 km. 3.14. 273.15 K.
  Here the number is not a reference to the fact — it is the fact.
- **A name.** 911 for the Porsche, 808 for the Roland, 5 for Chanel N°5, 221B
  for Holmes. The number is how you say the thing.

Appearing somewhere is not enough on its own. A clock reading 10:03 in the
background of a scene is not an entry; 10:04 PM is.`,
    },

    sequences: {
      heading: '2. Sequence and edition numbers',
      body: `Season 2. *GTA 3*. The 2022 World Cup. iPhone 15. Super Bowl 52. Episode 4. The
number is an index, an edition or a year, and it carries no meaning the one
before it did not.

The line is where the number sits. In *District 9* the nine is the district — it
is in the film. In *GTA 3* the three is on the box, counting the ones before it;
nothing in the game is three.

**The exception is a number that outgrew its series.** Apollo 11 is the moon
landing and Apollo 13 is the one that came back — two of eleven crewed missions,
each for its own reason, which is precisely why the other nine are not entries.
Area 51, AK-47, Experiment 626 and Earth-616 are the same shape: the number
started as an index and stopped being one.

If you are unsure, ask it backwards: *could 10, 11, 12 and 13 all be entries for
the same reason?* When the reason is "it is the next one", none of them can.

Why this is a rule and not a preference: [the index](/) is what this wiki is,
and \`/n/1\` through \`/n/30\` would be nothing but "Season N of —".`,
    },

    mining: {
      heading: '3. Number mining',
      body: `A film has hundreds of numbers in it. Do not read one and file them.

A number taken out of a work should be at least one of these: a plot device,
repeated, decisive, tied to a character's identity, or known outside the work.
Room 237 in *The Shining* is all five; $23.70 on a receipt in the same film is
none of them.

**Working through a source to raise a count is the one thing here treated as
spam** rather than as a mistake — a film, a brand's catalogue, a sports
database, a timeline. A good wiki of numbers is not the one with the most
numbers in it.`,
    },

    why: {
      heading: '4. Explanation and accuracy',
      body: `\`33 — Santal 33\` matches a number to a name. \`33 — Santal 33, for the
thirty-three ingredients in the formula\` is an entry. The wiki is not an index
of numbers against names; it is what is attached to them.

And numbers are the subject here, so get them right — units, decimal points,
dates, notation, what the number actually measures. \`9.81 — gravity\` is worse
than \`9.81 m/s² — Earth's gravitational acceleration\`, and the second is not
longer by accident.`,
    },

    never: {
      heading: 'Never eligible',
      body: `- **Somebody's private number.** A phone number, an account, an ID, a home
  address, a living person's date of birth. There are no accounts here, so
  there is nobody to take it back afterwards — and making a number findable is
  the one thing this wiki does.
- **A number flown rather than explained.** 14, 88 and their relatives mean
  something to a movement, and saying what they mean is what a reference work
  is for. An entry that documents one is an entry; one written to signal is
  not, and which it is has always been legible in the writing.
- **Somebody else's writing.** Everything published here is
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain,
  permanently, for anyone. You can only give away what is yours to give. Quote
  a source and link it; do not paste it.
- **An advertisement.** A number written to point at something you are
  selling.`,
    },

    'what-happens': {
      heading: 'Enforcement',
      body: `An entry that breaks one of these is not removed by whoever noticed. There is no
delete button anywhere in this wiki and the API refuses the request if you go
looking for one: on a wiki anyone can write to, a wiki anyone can empty is no
wiki at all. Nothing above is a submission being turned down, because nothing
here is submitted — what you write is live the moment you press Publish.

What happens instead, in this order:

- **Fix it.** Most of this page describes an entry that is wrong rather than
  one that is unwelcome, and an edit costs one person one click. The first
  writer's name is kept and never overwritten, so correcting a stranger costs
  them nothing either.
- **Flag it.** Every entry carries a panel with both halves — that something is
  wrong with it, and that it should be taken down. Only the second asks for a
  nickname, because only the second is read as a request from somebody.
- **An operator hides it.** A hidden entry drops out of every public list and
  page and comes back whole if the call was wrong. Nothing is lost while
  somebody decides.

The one hard delete happens in a shell, by hand, for a removal the law
requires. It is not a moderation tool, and what it takes does not come back.`,
    },

    'by-subject': {
      heading: 'Criteria by subject',
      body: `Nothing new below this line — it is the rules above applied one kind of thing at
a time, for when the answer is not obvious or when somebody needs a row to point
at.`,
    },

    works: {
      heading: 'Films, books, games',
      rows: [
        ["42 — *The Hitchhiker's Guide to the Galaxy*", '*Toy Story 3* — the three counts the films'],
        ['237 — the room in *The Shining*', '$23.70 on a receipt in the same film'],
        ['451 — *Fahrenheit 451*, where paper burns', "a taxi's number, seen once and never again"],
        ['300 — the Spartans at Thermopylae', 'Episode 4, Season 2, Volume 7'],
        ["1984 — Orwell's year", 'the year a film came out'],
      ],
      note: `A number in a title is where this gets argued, so the question is the same one
as everywhere else: is the number in the work, or on the box? *Se7en*, *The
Number 23*, *2001: A Space Odyssey* and *2046* are all the first. *Rocky IV* is
the second.`,
    },

    dates: {
      heading: 'Dates and times',
      rows: [
        ["11/22/63 — Kennedy, and King's novel", 'the day a film opened'],
        ['11:11 — *Us*, and Jeremiah 11:11', 'a timestamp visible in one scene'],
        ['09:41 — the time on every iPhone in an Apple photograph', "a living person's birthday"],
        ['29 February — the leap day', 'the date of an ordinary event'],
      ],
    },

    science: {
      heading: 'Science and measurement',
      rows: [
        ['3.14, 2.718, 1.618', 'a coefficient from one paper'],
        ['299792458 m/s — the speed of light', 'a reading from one experiment'],
        ['273.15 K, 101325 Pa', 'a tolerance off one datasheet'],
        ['42.195 km — the marathon', 'a value with no life outside its field'],
      ],
    },

    tech: {
      heading: 'Ports, protocols and standards',
      rows: [
        ['22, 80, 443 — SSH, HTTP, HTTPS', '49152 — a port one project picked'],
        ['3306, 5432, 6379, 27017', 'an internal build or ticket number'],
        ['404 — Not Found', 'a status code a single service invented'],
        ['802.11, H.264, SHA-256', 'a version number that only counts'],
      ],
    },

    brands: {
      heading: 'Brands and products',
      rows: [
        ['Chanel N°5, Porsche 911', 'Galaxy S24, iPhone 17, PlayStation 5'],
        ['Santal 33, Another 13, 59FIFTY', 'a model number that only counts'],
        ['Baskin-Robbins 31, AK-47', 'ABC-4382'],
      ],
    },

    people: {
      heading: 'People and their numbers',
      rows: [
        ['23 — Michael Jordan', "every player's shirt number"],
        ['42 — Jackie Robinson, retired across the league', 'a number somebody famous once wore'],
        ['007 — Bond', 'a number assigned to a private person'],
      ],
    },

    places: {
      heading: 'Addresses and rooms',
      rows: [
        ['221B Baker Street', 'apartment 502, visited once'],
        ['742 Evergreen Terrace', 'where a real person actually lives'],
        ['31 Spooner Street, 177A Bleecker Street', 'a licence plate in one shot'],
      ],
    },

    internet: {
      heading: 'Internet culture',
      rows: [
        ['34 — Rule 34', 'a meme from one server, last month'],
        ['420, 1337, 666, 777, 69', 'a running joke in one comment section'],
      ],
    },


    writing: { heading: 'Writing an entry' },

    many: {
      heading: 'Multiple meanings',
      body: `A number is not spoken for. 42 holds *The Hitchhiker's Guide*, Jackie Robinson
and whatever else is filed under it, and each is its own entry — the page at
\`/n/42\` is the list of them. If 42 is already here, a new entry joins it rather
than replacing it.`,
    },

    duplicates: {
      heading: 'Duplicate entries',
      body: `\`42 — Jackie Robinson\`, \`42 — Jackie Robinson's jersey number\` and
\`42 — retired across MLB\` are one fact worded three ways. One entry says all of
it: *Jackie Robinson wore 42, and it was later retired across Major League
Baseball.* Knowing more than an entry says is an edit, not a second entry — and
if a duplicate is already there, merge it by editing and flag the leftover as a
duplicate.`,
    },

    boxes: {
      heading: 'Form fields',
      body: `The form has fewer fields than you might expect, and that is deliberate. The
**number** and its **format** decide the address — \`/n/42\` for a number,
\`/a/UFO\` for an abbreviation. The **title** is what it refers to, in a few
words. The **details** box is everything else, Markdown, and it is where the
story, the working and the link to a source all go: there is no separate source
field, and an entry with nothing to back it up can be flagged for exactly that.
**Tags** are free-form and lower-case — pick an existing chip where one fits
rather than coining a near-duplicate. Your **nickname** is a byline, not an
account.`,
    },

    four: {
      heading: 'Summary',
      body: `- **A meaning.** There is something to explain, and the number is what is being
  explained.
- **Recognition.** The tie between the number and the subject is established
  somewhere other than in your head.
- **An end.** It is not the first of an unbounded list.
- **A reason to click.** Somebody who opens it comes away knowing why that
  number, and not another one.`,
    },
  },
}

export default en
