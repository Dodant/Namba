import { Link } from 'react-router-dom'
import { ACTION_LABEL, meta, type Event } from './api'
import { Badge, Empty, Hash, Table, When } from './ui'

/** What one row of the log says in a sentence.

    The log is verbs and ids on purpose, so somewhere has to turn it back into
    English -- and it is here rather than in the API, whose job is to answer what
    happened and not to phrase it. An action with no label shows its own name:
    readable enough, and better than the panel needing a change before it can
    describe a new one. */
function sentence(e: Event) {
  const said = ACTION_LABEL[e.action] ?? e.action.toLowerCase().replace(/_/g, ' ')
  const bits = meta(e)
  const extra =
    e.action === 'DELETE_REQUEST' || e.action === 'REPORT'
      ? String(bits.reason ?? '')
      : e.action === 'TRANSLATE'
        ? String(bits.lang ?? '')
        : e.action === 'CLIENT_BLOCK'
          ? [bits.kind, bits.hours ? `${bits.hours}h` : 'permanent'].join(' ')
          : e.action === 'EDIT' && Array.isArray(bits.fields)
            ? (bits.fields as string[]).join(', ')
            : /* the type, the route pattern and the line -- all three, because
                 one of them alone does not tell an operator whether this is
                 one broken page or the database being down. */
              e.action === 'ERROR'
              ? [bits.error, bits.route, bits.where].filter(Boolean).join(' · ')
              : ''
  const note = String(bits.note ?? '')
  return { said, extra, note }
}

/** The one table three pages are made of: the dashboard's "lately", the wiki's
    recent changes, and the audit log. They differ by a filter, which is the
    whole reason `events` is one table and not three. */
export function LogTable({ rows }: { rows: Event[] }) {
  if (!rows.length) return <Empty>Nothing here yet.</Empty>
  return (
    <Table cols={['When', 'Who', 'Did', 'To', 'From']}>
      {rows.map((e) => {
        const { said, extra, note } = sentence(e)
        return (
          <tr key={e.id}>
            <td className="tight">
              <When at={e.at} />
            </td>
            <td className="tight">
              {/* Three kinds of actor and they have to be told apart. An
                  operator's decision carries their address. A visitor's write
                  carries the nickname they typed, which is not an identity and
                  is not checked. And an `admin.py` command carries neither,
                  because nobody was signed in -- calling that "anonymous"
                  filed a shell command as a passing stranger. */}
              {e.by ? (
                <b>{e.by}</b>
              ) : meta(e).by === 'shell' ? (
                <span className="hash">the server, from a shell</span>
              ) : (
                <span>{e.actor || 'anonymous'}</span>
              )}
            </td>
            <td>
              {said}
              {extra && <span className="hash"> · {extra}</span>}
              {note && <p className="said">{note}</p>}
            </td>
            <td className="wide">
              {e.target_type === 'post' && e.target_id ? (
                e.title ? (
                  <Link to={`/content/${e.target_id}`}>
                    <span className="num">{e.value}</span> {e.title}
                  </Link>
                ) : (
                  /* purged from a shell, since nothing else removes a row. The
                     event outlives it, which is the point of the table having
                     no foreign keys. */
                  <span className="hash">entry {e.target_id}, gone</span>
                )
              ) : (
                <span className="hash">
                  {e.target_type ? `${e.target_type} ${e.target_id ?? ''}` : '—'}
                </span>
              )}
            </td>
            <td className="tight">
              {e.admin_id ? <Badge>ADMIN</Badge> : <Hash value={e.ip_hash} />}
            </td>
          </tr>
        )
      })}
    </Table>
  )
}
