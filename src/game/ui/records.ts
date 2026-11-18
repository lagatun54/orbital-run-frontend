import type { LeaderboardEntry, LeaderboardView } from '../../leaderboard/interfaces/leaderboard.js'

const previewSize = 10

export function createRecords(announce: LeaderboardView['announce'], signal: AbortSignal) {
  const root = document.createElement('aside')
  root.className = 'leaderboard'
  root.setAttribute('aria-label', 'Таблица лидеров')
  const header = document.createElement('h2')
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'leaderboard-title'
  toggle.innerHTML = 'Таблица лидеров <span aria-hidden="true"></span>'
  toggle.setAttribute('aria-controls', 'leaderboard-content')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.hidden = true
  const caption = document.createElement('span')
  caption.className = 'leaderboard-title'
  caption.textContent = 'Таблица лидеров'
  header.append(caption, toggle)
  const rows = document.createElement('ol')
  rows.setAttribute('role', 'list')
  rows.setAttribute('aria-label', 'Места и очки')
  rows.hidden = true
  const message = document.createElement('p')
  message.setAttribute('role', 'status')
  message.textContent = 'Загружаем рейтинг…'
  const rank = document.createElement('p')
  rank.className = 'leaderboard-rank'
  rank.hidden = true
  const content = document.createElement('div')
  content.className = 'leaderboard-content'
  content.id = 'leaderboard-content'
  content.append(rows, message, rank)
  root.append(header, content)

  let entries: readonly LeaderboardEntry[] = []
  let selectedId: string | undefined
  let expanded = false
  let compact = false

  function draw() {
    const canExpand = compact || entries.length > previewSize
    expanded &&= canExpand
    toggle.hidden = !canExpand
    caption.hidden = canExpand
    toggle.setAttribute('aria-expanded', String(expanded))
    content.hidden = compact && !expanded
    rows.hidden = entries.length === 0
    rows.tabIndex = 0
    rows.replaceChildren(...(expanded ? entries : entries.slice(0, previewSize)).map((entry, i) => {
      const row = document.createElement('li')
      const position = document.createElement('span')
      const name = document.createElement('span')
      const score = document.createElement('span')
      position.className = 'leaderboard-place'
      position.textContent = `${i + 1}.`
      name.className = 'leaderboard-name'
      const pilot = entry.name || 'Пилот'
      name.textContent = entry.local ? `${pilot} (локально)` : pilot
      score.className = 'leaderboard-score'
      score.textContent = String(entry.score)
      score.setAttribute('aria-label', `${entry.score} очков`)
      row.append(position, name, score)
      if (entry.id === selectedId) {
        row.className = 'is-player'
        row.setAttribute('aria-current', 'true')
      }
      return row
    }))
  }

  function setExpanded(value: boolean) {
    if (expanded === value || (!compact && entries.length <= previewSize)) return false
    expanded = value
    draw()
    rows.scrollTop = 0
    return true
  }

  toggle.addEventListener('click', () => setExpanded(!expanded), { signal })
  root.addEventListener('keydown', event => {
    if (event.target === rows && event.key.startsWith('Arrow')) event.stopPropagation()
    if (event.key === 'Escape' && setExpanded(false)) {
      toggle.focus()
      event.preventDefault()
    }
  }, { signal })

  function showState(text: string) {
    message.textContent = text
    message.hidden = entries.length > 0 || !text
  }

  const view: LeaderboardView = {
    announce,
    showEntries(values, selection) {
      entries = values
      selectedId = selection
      showState(values.length ? '' : 'Рекордов пока нет')
      draw()
    },
    showState,
    hideResult(clearSelection) {
      rank.hidden = true
      if (clearSelection && selectedId !== undefined) {
        selectedId = undefined
        draw()
      }
    },
    showRank(place, score) {
      rank.textContent = `Вы: ${place} · ${score}`
      rank.hidden = false
    },
  }

  return {
    root, view, setExpanded, toggle: () => setExpanded(!expanded),
    setCompact(value: boolean) {
      if (compact === value) return
      compact = value
      expanded = false
      root.classList.toggle('is-compact', compact)
      draw()
    },
  }
}
