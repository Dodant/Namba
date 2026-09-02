import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api, entryPath, fmtDate, liked, numSize, plain, showValue, tagLabel, tagPath,
  type Post,
} from '../api'
import { useUi } from '../uiLocale'

/* Takes the two fields it uses rather than a whole Post, so the number index
   can hand it a bare entry. */
export function Like({ post }: { post: { id: number; likes: number } }) {
  const { locale } = useUi()
  const [n, setN] = useState(post.likes)
  const [on, setOn] = useState(() => liked.has(post.id))

  async function toggle() {
    const next = liked.toggle(post.id)
    setOn(next)
    setN((v) => v + (next ? 1 : -1)) // optimistic
    try {
      setN((await api.like(post.id, next)).likes)
    } catch {
      liked.toggle(post.id) // put the browser's record back
      setOn(!next)
      setN((v) => v - (next ? 1 : -1))
    }
  }

  const says = locale === 'ko'
    ? `${on ? '좋아요 취소' : '좋아요'} — ${n}개`
    : `${on ? 'Unlike' : 'Like'} — ${n} ${n === 1 ? 'like' : 'likes'}`

  return (
    <button
      className={`btn small ${on ? 'on' : ''}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={says}
      title={says}
    >
      ♥ {n}
    </button>
  )
}

export default function PostCard({
  post,
  showNumber = true,
  except,
}: {
  post: Post
  showNumber?: boolean
  /** the tag this list is already filtered by, so a row does not carry a
      chip linking to the page it is on. */
  except?: string
}) {
  const { locale, m } = useUi()
  return (
    <article className="card">
      {showNumber && (
        <Link
          className={`num ${numSize(showValue(post.value, post.grouped))}`}
          to={entryPath(post.value, post.format)}
        >
          {showValue(post.value, post.grouped)}
        </Link>
      )}
      <div className="main">
        <h2>
          <Link to={`/p/${post.id}`}>{post.title}</Link>
        </h2>
        {post.body && <p>{plain(post.body)}</p>}
        <div className="meta">
          {post.tags
            .filter((t) => t !== except)
            .map((t) => (
              <Link key={t} className="tag" to={tagPath(t)}>
                {tagLabel(t)}
              </Link>
            ))}
          <span>
            {m.common.by(post.author)} · {fmtDate(post.created_at, locale)}
          </span>
          {post.updated_at !== post.created_at && (
            <span>
              · {m.common.edited(fmtDate(post.updated_at, locale), post.edited_by)}
            </span>
          )}
          <Like post={post} />
          <Link className="quiet" to={`/p/${post.id}/edit`}>
            {m.common.edit}
          </Link>
        </div>
      </div>
      {/* lazy because a card is a row in a list and most of the list is under
          the fold -- an index of 180 numbers used to fetch every thumbnail at
          once. alt="" is deliberate and stays: the title beside it is the link
          and the picture repeats it. */}
      {post.image && (
        <img className="thumb" src={post.image} alt="" loading="lazy" decoding="async" />
      )}
    </article>
  )
}
