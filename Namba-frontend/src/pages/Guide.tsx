import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/* The wiki's one page of rules, in two layers.

   Everything above the rule is what somebody about to type a value needs: one
   test, four rules, four things that are never entries, and what happens when
   an entry breaks one. Everything below it is the same questions asked one
   subject at a time, which is the half an operator points at rather than the
   half a poster reads. Every heading carries an id for exactly that -- /guide
   #sequences is a link you can put in a delete request.

   Why any of it is written down: every other guard here is a 422 or a column
   an operator sets, and none of them can hold this one. `3` is a valid value
   whether it is the Trinity or the third GTA, so no parser can tell an entry
   from a serial number.

   .body for the prose rhythm -- the same stylesheet /p/:id's markdown renders
   into, headings, lists, tables and all -- and .guide adds the measure and the
   h1 on .form's own rules. .tbl is the scroll port a table needs at 320px, and
   it is the wrapper rather than the table for the reason index.css gives.

   Deliberately NOT in index.css's :is() no-select list, unlike every other
   sentence the app says about itself. That rule keeps chrome out of a copy of
   an entry; there is no entry on this page to contaminate, and a page of rules
   is the one thing here somebody has a reason to quote at somebody else. */

/* Nine of these below the rule, always the same two columns, so the shape is
   written once. */
function Cases({ id, heading, rows }: {
  id: string
  heading: string
  rows: [ReactNode, ReactNode][]
}) {
  return (
    <>
      <h3 id={id}>{heading}</h3>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>An entry</th>
              <th>Not an entry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([yes, no], i) => (
              <tr key={id + i}>
                <td>{yes}</td>
                <td>{no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function Guide() {
  return (
    <article className="body guide">
      <h1>What belongs here</h1>
      <p>
        Namba is a wiki of what numbers mean — not a list of every place a
        number turns up. An entry is one meaning of one number, and the meaning
        has to belong to the number rather than sit next to it. Anyone may write
        one and anyone may correct it, and nothing is reviewed before it goes
        up, so this page is what stands where a review would.
      </p>

      <h2 id="test">The test</h2>
      <p>
        <b>Could the same rule produce a hundred more entries?</b> If it could,
        what you have is a series rather than a meaning. Every rule under this
        one is that question asked about a particular kind of thing.
      </p>
      <p>
        When it is close, ask the other one: <b>would the meaning survive if the
        number were swapped?</b> Change the 42 in <cite>The Hitchhiker’s Guide</cite>{' '}
        and the joke is gone. Change the 3 in <cite>GTA 3</cite> and you have{' '}
        <cite>GTA 4</cite> — a different game, and the same kind of number.
      </p>

      <hr />

      <h2 id="the-point">1. The number has to be the point</h2>
      <p>
        A number belongs when it is part of what the thing is — printed in its
        title, spoken in its text, or standing for something people already
        recognise.
      </p>
      <ul>
        <li>
          <b>In a work.</b> 42 in <cite>The Hitchhiker’s Guide to the Galaxy</cite>.
          237 in <cite>The Shining</cite>. 10:04 PM in <cite>Back to the
          Future</cite>. 626 for Stitch.
        </li>
        <li>
          <b>Standing for something.</b> 404 for Not Found. 23 for the birthday
          paradox. Three for the Trinity, nine lives, cloud nine. 4 is the
          unlucky one across Korea, Japan and China for the same kind of reason
          13 is here.
        </li>
        <li>
          <b>A constant or a measurement.</b> 299792458 m/s. 42.195 km. 3.14.
          273.15 K. Here the number is not a reference to the fact — it is the
          fact.
        </li>
        <li>
          <b>A name.</b> 911 for the Porsche, 808 for the Roland, 5 for Chanel
          N°5, 221B for Holmes. The number is how you say the thing.
        </li>
      </ul>
      <p>
        Appearing somewhere is not enough on its own. A clock reading 10:03 in
        the background of a scene is not an entry; 10:04 PM is.
      </p>

      <h2 id="sequences">2. Not a number that only counts its own sequels</h2>
      <p>
        Season 2. <cite>GTA 3</cite>. The 2022 World Cup. iPhone 15. Super Bowl
        52. Episode 4. The number is an index, an edition or a year, and it
        carries no meaning the one before it did not.
      </p>
      <p>
        The line is where the number sits. In <cite>District 9</cite> the nine is
        the district — it is in the film. In <cite>GTA 3</cite> the three is on
        the box, counting the ones before it; nothing in the game is three.
      </p>
      <p>
        <b>The exception is a number that outgrew its series.</b> Apollo 11 is
        the moon landing and Apollo 13 is the one that came back — two of
        thirteen missions, each for its own reason, which is precisely why the
        other eleven are not entries. Area 51, AK-47, Experiment 626 and
        Earth-616 are the same shape: the number started as an index and stopped
        being one.
      </p>
      <p>
        If you are unsure, ask it backwards: <i>could 10, 11, 12 and 13 all be
        entries for the same reason?</i> When the reason is “it is the next
        one”, none of them can.
      </p>
      <p>
        Why this is a rule and not a preference: <Link to="/">the index</Link> is
        what this wiki is, and <code>/n/1</code> through <code>/n/30</code> would
        be nothing but “Season N of —”.
      </p>

      <h2 id="mining">3. One work is not a quarry</h2>
      <p>
        A film has hundreds of numbers in it. Do not read one and file them.
      </p>
      <p>
        A number taken out of a work should be at least one of these: a plot
        device, repeated, decisive, tied to a character’s identity, or known
        outside the work. Room 237 in <cite>The Shining</cite> is all five;
        $23.70 on a receipt in the same film is none of them.
      </p>
      <p>
        <b>Working through a source to raise a count is the one thing here
        treated as spam</b> rather than as a mistake — a film, a brand’s
        catalogue, a sports database, a timeline. A good wiki of numbers is not
        the one with the most numbers in it.
      </p>

      <h2 id="why">4. Say why the number matters</h2>
      <p>
        <code>33 — Santal 33</code> matches a number to a name.{' '}
        <code>33 — Santal 33, for the thirty-three ingredients in the
        formula</code> is an entry. The wiki is not an index of numbers against
        names; it is what is attached to them.
      </p>
      <p>
        And numbers are the subject here, so get them right — units, decimal
        points, dates, notation, what the number actually measures.{' '}
        <code>9.81 — gravity</code> is worse than{' '}
        <code>9.81 m/s² — Earth’s gravitational acceleration</code>, and the
        second is not longer by accident.
      </p>

      <h2 id="never">Never</h2>
      <ul>
        <li>
          <b>Somebody’s private number.</b> A phone number, an account, an ID, a
          home address, a living person’s date of birth. There are no accounts
          here, so there is nobody to take it back afterwards — and making a
          number findable is the one thing this wiki does.
        </li>
        <li>
          <b>A number flown rather than explained.</b> 14, 88 and their
          relatives mean something to a movement, and saying what they mean is
          what a reference work is for. An entry that documents one is an entry;
          one written to signal is not, and which it is has always been legible
          in the writing.
        </li>
        <li>
          <b>Somebody else’s writing.</b> Everything published here is{' '}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a> —
          public domain, permanently, for anyone. You can only give away what is
          yours to give. Quote a source and link it; do not paste it.
        </li>
        <li>
          <b>An advertisement.</b> A number written to point at something you
          are selling.
        </li>
      </ul>

      <h2 id="what-happens">Nothing here is deleted by a click</h2>
      <p>
        An entry that breaks one of these is not removed by whoever noticed.
        There is no delete button anywhere in this wiki and the API refuses the
        request if you go looking for one: on a wiki anyone can write to, a wiki
        anyone can empty is no wiki at all. Nothing above is a submission being
        turned down, because nothing here is submitted — what you write is live
        the moment you press Publish.
      </p>
      <p>What happens instead, in that order:</p>
      <ul>
        <li>
          <b>Fix it.</b> Most of this page describes an entry that is wrong
          rather than one that is unwelcome, and an edit costs one person one
          click. The first writer’s name is kept and never overwritten, so
          correcting a stranger costs them nothing either.
        </li>
        <li>
          <b>Flag it.</b> Every entry carries a panel with both halves — that
          something is wrong with it, and that it should be taken down. Only the
          second asks for a nickname, because only the second is read as a
          request from somebody.
        </li>
        <li>
          <b>An operator hides it.</b> A hidden entry drops out of every public
          list and page and comes back whole if the call was wrong. Nothing is
          lost while somebody decides.
        </li>
      </ul>
      <p>
        The one hard delete happens in a shell, by hand, for a removal the law
        requires. It is not a moderation tool and it does not come back.
      </p>

      <hr />

      <h2 id="by-subject">The same four questions, by subject</h2>
      <p>
        Nothing new below this line — it is the rules above applied one kind of
        thing at a time, for when the answer is not obvious or when somebody
        needs a row to point at.
      </p>

      <Cases
        id="works"
        heading="Films, books, games"
        rows={[
          [<>42 — <cite>The Hitchhiker’s Guide to the Galaxy</cite></>,
           <><cite>Toy Story 3</cite> — the three counts the films</>],
          [<>237 — the room in <cite>The Shining</cite></>,
           <>$23.70 on a receipt in the same film</>],
          [<>451 — <cite>Fahrenheit 451</cite>, where paper burns</>,
           <>a taxi’s number, seen once and never again</>],
          [<>300 — the Spartans at Thermopylae</>,
           <>Episode 4, Season 2, Volume 7</>],
          [<>1984 — Orwell’s year</>, <>the year a film came out</>],
        ]}
      />
      <p>
        A number in a title is where this gets argued, so the question is the
        same one as everywhere else: is the number in the work, or on the box?{' '}
        <cite>Se7en</cite>, <cite>The Number 23</cite>,{' '}
        <cite>2001: A Space Odyssey</cite> and <cite>2046</cite> are all the
        first. <cite>Rocky IV</cite> is the second.
      </p>

      <Cases
        id="dates"
        heading="Dates and times"
        rows={[
          [<>11/22/63 — Kennedy, and King’s novel</>, <>the day a film opened</>],
          [<>11:11 — <cite>Us</cite>, and Jeremiah 11:11</>,
           <>a timestamp visible in one scene</>],
          [<>09:41 — the time on every iPhone in an Apple photograph</>,
           <>a living person’s birthday</>],
          [<>29 February — the leap day</>, <>the date of an ordinary event</>],
        ]}
      />

      <Cases
        id="science"
        heading="Science and measurement"
        rows={[
          [<>3.14, 2.718, 1.618</>, <>a coefficient from one paper</>],
          [<>299792458 m/s — the speed of light</>,
           <>a reading from one experiment</>],
          [<>273.15 K, 101325 Pa</>, <>a tolerance off one datasheet</>],
          [<>42.195 km — the marathon</>, <>a value with no life outside its field</>],
        ]}
      />

      <Cases
        id="tech"
        heading="Ports, protocols and standards"
        rows={[
          [<>22, 80, 443 — SSH, HTTP, HTTPS</>, <>49152 — a port one project picked</>],
          [<>3306, 5432, 6379, 27017</>, <>an internal build or ticket number</>],
          [<>404 — Not Found</>, <>a status code a single service invented</>],
          [<>802.11, H.264, SHA-256</>, <>a version number that only counts</>],
        ]}
      />

      <Cases
        id="brands"
        heading="Brands and products"
        rows={[
          [<>Chanel N°5, Porsche 911</>, <>Galaxy S24, iPhone 17, PlayStation 5</>],
          [<>Santal 33, Another 13, 59FIFTY</>, <>a model number that only counts</>],
          [<>Baskin-Robbins 31, AK-47</>, <>ABC-4382</>],
        ]}
      />

      <Cases
        id="people"
        heading="People and their numbers"
        rows={[
          [<>23 — Michael Jordan</>, <>every player’s shirt number</>],
          [<>42 — Jackie Robinson, retired across the league</>,
           <>a number somebody famous once wore</>],
          [<>007 — Bond</>, <>a number assigned to a private person</>],
        ]}
      />

      <Cases
        id="places"
        heading="Addresses and rooms"
        rows={[
          [<>221B Baker Street</>, <>apartment 502, visited once</>],
          [<>742 Evergreen Terrace</>, <>where a real person actually lives</>],
          [<>31 Spooner Street, 177A Bleecker Street</>,
           <>a licence plate in one shot</>],
        ]}
      />

      <Cases
        id="internet"
        heading="Internet culture"
        rows={[
          [<>34 — Rule 34</>, <>a meme from one server, last month</>],
          [<>420, 1337, 666, 777, 69</>, <>a running joke in one comment section</>],
        ]}
      />

      <Cases
        id="stats"
        heading="Statistics and records"
        rows={[
          [<>9.58 — Bolt’s hundred metres, quoted as a number</>,
           <>a film’s budget, or its runtime</>],
          [<>56 — DiMaggio’s hitting streak</>,
           <>a season’s points, a song’s BPM</>],
          [<>—</>, <>a building’s floors, a headcount, a view count</>],
        ]}
      />
      <p>
        Most figures are facts without being meanings. A record crosses over
        when people say the number instead of describing it, and that is a thing
        you can check rather than feel.
      </p>

      <h2 id="writing">Writing the entry</h2>

      <h3 id="many">One number, many meanings</h3>
      <p>
        A number is not spoken for. 42 holds{' '}
        <cite>The Hitchhiker’s Guide</cite>, Jackie Robinson and whatever else
        is filed under it, and each is its own entry — the page at{' '}
        <code>/n/42</code> is the list of them. If 42 is already here, a new
        entry joins it rather than replacing it.
      </p>

      <h3 id="duplicates">Do not file one fact twice</h3>
      <p>
        <code>42 — Jackie Robinson</code>,{' '}
        <code>42 — Jackie Robinson’s jersey number</code> and{' '}
        <code>42 — retired across MLB</code> are one fact worded three ways. One
        entry says all of it: <i>Jackie Robinson wore 42, and it was later
        retired across Major League Baseball.</i> Knowing more than an entry
        says is an edit, not a second entry — and if a duplicate is already
        there, merge it by editing and flag the leftover as a duplicate.
      </p>

      <h3 id="boxes">What goes in which box</h3>
      <p>
        The form has fewer fields than you might expect, and that is deliberate.
        The <b>number</b> and its <b>format</b> decide the address —{' '}
        <code>/n/42</code> for a number, <code>/a/UFO</code> for an
        abbreviation. The <b>title</b> is what it refers to, in a few words. The{' '}
        <b>details</b> box is everything else, markdown, and it is where the
        story, the working and the link to a source all go: there is no separate
        source field, and an entry with nothing to back it up can be flagged for
        exactly that. <b>Tags</b> are free-form and lower-case — pick an
        existing chip where one fits rather than coining a near-duplicate. Your{' '}
        <b>nickname</b> is a byline, not an account.
      </p>

      <hr />

      <h2 id="four">What the strongest entries have</h2>
      <ul>
        <li>
          <b>A meaning.</b> There is something to explain, and the number is
          what is being explained.
        </li>
        <li>
          <b>Recognition.</b> The tie between the number and the subject is
          established somewhere other than in your head.
        </li>
        <li>
          <b>An end.</b> It is not the first of an unbounded list.
        </li>
        <li>
          <b>A reason to click.</b> Somebody who opens it comes away knowing why
          that number, and not another one.
        </li>
      </ul>

      <p>
        That is the whole of it. <Link to="/new">Add an entry.</Link>
      </p>
    </article>
  )
}
