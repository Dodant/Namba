import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api, fmtDate, liked, numberPath, plain, showValue, tagLabel, tagPath, type Post,
} from '../api'

/* Takes the two fields it uses rather than a whole Post, so the number index
   can hand it a bare entry. */
export function Like({ post }: { post: { id: number; likes: number } }) {
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

  const says = `${on ? 'Unlike' : 'Like'} — ${n} ${n === 1 ? 'like' : 'likes'}`

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
  return (
    <article className="card">
      {showNumber && (
        <Link className="num" to={numberPath(post.value)}>
          {showValue(post.value, post.grouped)}
        </Link>
      )}
      <div className="main">
        <h3>
          <Link to={`/p/${post.id}`}>{post.title}</Link>
        </h3>
        {post.body && <p>{plain(post.body)}</p>}
        <div className="meta">
          {post.tags.map((t) => (
            <Link key={t} className="tag" to={tagPath(t)}>
              {tagLabel(t)}
            </Link>
          ))}
          <span>by {post.author}</span>
          <span>{fmtDate(post.created_at)}</span>
          {post.updated_at !== post.created_at && (
            <span>
              · edited {fmtDate(post.updated_at)}
              {post.edited_by && ` by ${post.edited_by}`}
            </span>
          )}
          <Like post={post} />
          <Link className="quiet" to={`/p/${post.id}/edit`}>
            edit
          </Link>
        </div>
      </div>
      {post.image && <img className="thumb" src={post.image} alt="" />}
    </article>
  )
}
