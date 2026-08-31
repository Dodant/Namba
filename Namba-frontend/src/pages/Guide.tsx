import { Link } from 'react-router-dom'

/* The one page here that is rules rather than entries.

   It exists because the index is the product. Every other guard on this wiki
   is a 422 or a column an operator sets; this one cannot be, because "the
   number is the meaning" is not a shape a parser can check -- `3` is a fine
   value whether it is the Trinity or the third GTA. So it is written down, in
   the reader's way, next to the two places a reader is about to need it: the
   footer and the form's intro.

   .body for the prose rhythm, which is the same stylesheet /p/:id's markdown
   renders into -- headings, lists, links, spacing, all of it already decided.
   .guide only sets the width and the h1, on selectors added to .form's own
   rules rather than rules of its own.

   Deliberately NOT in index.css's :is() no-select list, unlike every other
   sentence the app says about itself. That rule is there so a drag across an
   entry does not come away with band labels and chip text sitting on top of
   the line somebody wanted. There is no entry on this page to contaminate --
   it is prose end to end -- and a rules page is the one thing here somebody
   has an actual reason to quote at somebody else. */
export default function Guide() {
  return (
    <article className="body guide">
      <h1>What belongs here</h1>
      <p>
        Namba is a wiki of what numbers mean. An entry is one meaning of one
        number; anyone may write one and anyone may correct it. This page is what
        keeps <Link to="/">the index</Link> worth reading, so it is the closest
        thing here to a rule.
      </p>

      <h2>The number has to be in the thing</h2>
      <p>
        A number belongs here when it is part of what the thing is — printed in
        its title, spoken in its text, or standing for something people already
        recognise.
      </p>
      <ul>
        <li>
          <b>In a work.</b> The seven in <cite>Seven</cite> is the deadly sins.{' '}
          <cite>12 Angry Men</cite> has twelve of them. <cite>8 Mile</cite> is a
          road, <cite>Catch-22</cite> is a clause with a number in it, and the
          district in <cite>District 9</cite> is the ninth. Title or text, either
          counts.
        </li>
        <li>
          <b>Standing for something.</b> Three for the Trinity, four Horsemen,
          nine lives, cloud nine, thirteen for bad luck. A number a culture uses
          as a word — any culture: 4 is the unlucky one across Korea, Japan and
          China for the same kind of reason 13 is here.
        </li>
        <li>
          <b>A constant or a measurement.</b> 299792458 metres per second.
          42.195 kilometres. 3.14. Here the number is not a reference to the
          fact — it is the fact.
        </li>
      </ul>

      <h2>Not a number that only counts its own sequels</h2>
      <p>
        Season 2. <cite>GTA 3</cite>. The 2006 World Cup. iPhone 15. Volume 4.
      </p>
      <p>
        The line is where the number sits. In <cite>District 9</cite> the nine is
        the district — it is in the film. In <cite>GTA 3</cite> the three is on
        the box, counting the ones before it; nothing in the game is three.
      </p>
      <p>
        The test: <b>if the next one takes the next number, the number is a
        label.</b> There is a <cite>GTA 4</cite>, and it means only “the one
        after”. There is no <cite>Seven 2</cite>.
      </p>
      <p>
        The exception is a number that outgrew its series. Apollo 11 was the
        eleventh mission and is now the moon landing; Chanel N°5 was the fifth
        sample and is now the name of the perfume. When people say the number
        without the series, it has stopped counting.
      </p>
      <p>
        Why this one is a rule and not a preference: the index is what this wiki
        is, and <code>/n/1</code> through <code>/n/30</code> would be nothing but
        “Season N of —”.
      </p>

      <h2>One entry per meaning</h2>
      <p>
        If 42 is already here, a new entry joins it rather than replacing it — the
        number is a column, not a page somebody owns. Two entries saying the same
        thing are one entry: merge them by editing, and flag the leftover as a
        duplicate.
      </p>
      <p>
        Knowing more than an entry says is an edit, not a second entry. The first
        writer’s name is kept and never overwritten, so correcting a stranger
        costs them nothing.
      </p>

      <h2>What does not belong at all</h2>
      <ul>
        <li>
          <b>Somebody’s private number.</b> A phone number, an account, an ID, a
          home address, a private person’s date of birth. There are no accounts
          here, so there is nobody to take it back afterwards — and making a
          number findable is precisely what this wiki does.
        </li>
        <li>
          <b>An advertisement.</b> A number written to point at something you are
          selling.
        </li>
        <li>
          <b>Somebody else’s writing.</b> Everything published here is{' '}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a> —
          public domain, permanently, for anyone. You can only give away what is
          yours to give. Quote a source and link it; do not paste it.
        </li>
      </ul>

      <h2>Nothing here is deleted by a click</h2>
      <p>
        An entry that breaks one of these is not removed by whoever noticed.
        There is no delete button anywhere in this wiki and the API refuses the
        request if you go looking for one: on a wiki anyone can write to, a wiki
        anyone can empty is no wiki at all.
      </p>
      <p>What happens instead, in that order:</p>
      <ul>
        <li>
          <b>Fix it.</b> Most of this page describes an entry that is wrong
          rather than one that is unwelcome, and an edit costs one person one
          click.
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

      <p>
        That is the whole of it. <Link to="/new">Add an entry.</Link>
      </p>
    </article>
  )
}
