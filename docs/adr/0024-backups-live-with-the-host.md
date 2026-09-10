# ADR-0024: Backups live with the host, not in this repository

- Status: accepted
- Date: 2026-09-10

## Context

This wiki is one SQLite file on one box, shared with another stack under
`chiral-root`. Everything that has to survive is on one volume: the database,
the uploads and `secret.key`.

The obvious place for a backup script is beside the code it backs up. That is
where it was put on 2026-09-09, as `Namba-backend/backup.py`, on the reading
that the repository had none. The repository had none; the *host* had one, in
the other repository, and had been running it daily since 2026-09-01.

## Decision

Backups belong with the host, in `chiral-root/scripts/namba-backup.sh`, beside
the backup for the other stack on the same box and in the same crontab.

Three things go up daily, by three methods, because they change in three ways:

| | | |
|---|---|---|
| `namba.db` | differs every day | a new gzipped snapshot per day |
| `uploads/` | files are immutable and accumulate | `s3 sync`, incremental |
| `secret.key` | never changes | overwritten in one place |

The database is copied with SQLite's online backup API and never with `cp`: a
WAL database is two files while the wiki runs, and a copy of the main one
alone is missing everything since the last checkpoint. The key goes with it
because it salts the hashes in `events` and every block; a database restored
without it has blocks that match nothing and says nothing about it. The sync
does not use `--delete`, so a picture removed at the source stays in the
bucket -- the backup holding more than the original is harmless, and the
reverse deletes from the backup in the one situation a backup is for.

`Namba-backend/backup.py` is removed. It wrote to local disk by default, did
not carry the uploads, and had no off-box story; keeping it would have left
two backup procedures in the documentation, one of them worse, with the README
pointing at the worse one.

## Consequences

- A reader of this repository cannot see the script, so the README says what
  covers the wiki, where it lives, and how to restore from it. Losing that
  paragraph is how this decision gets made again by accident.
- The bucket expires objects after 30 days, so the window is a rolling month
  rather than a history.

## Verified

2026-09-10. Thirteen daily snapshots in the bucket, the newest downloaded and
opened: `PRAGMA integrity_check` ok, 522 posts, 520 `ACTIVE`, 36 revisions --
matching the live database exactly -- and the `secret.key` beside it hashing
identical to the one the running container is using. A backup nobody has
restored is a backup nobody has.

## History

- 2026-09-01: `namba-backup.sh` added to the host, and to root's crontab at
  03:15 daily. `gc_uploads.py --delete` runs at 04:30.
- 2026-09-09: `Namba-backend/backup.py` written here, duplicating it.
- 2026-09-10: found, verified, and the duplicate removed.
