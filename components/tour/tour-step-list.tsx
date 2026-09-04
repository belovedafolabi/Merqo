/**
 * The "Jump to" control injected into the driver.js popover (Milestone 17
 * Part D). Plain DOM, not React: driver.js owns the popover element and
 * re-renders it on every step, so this is built and handed to it via
 * `onPopoverRender` rather than mounted.
 *
 * The tour stays linear — Next / Back are unchanged, and jumping just calls
 * `driver().moveTo(i)`, after which the tour continues linearly from there.
 * On a narrow screen the list is a collapsed `<details>` so the popover keeps
 * within ~375px.
 */

export interface StepListEntry {
  title: string
}

export function buildStepList(
  steps: StepListEntry[],
  activeIndex: number,
  onJump: (index: number) => void,
  isMobile: boolean,
): HTMLElement {
  const list = document.createElement('div')
  list.className = 'merqo-tour-steps'
  list.setAttribute('role', 'list')

  steps.forEach((step, index) => {
    const entry = document.createElement('button')
    entry.type = 'button'
    entry.className = 'merqo-tour-steps__item'
    entry.setAttribute('role', 'listitem')
    entry.textContent = `${index + 1}. ${step.title}`
    if (index === activeIndex) {
      entry.setAttribute('aria-current', 'step')
      entry.classList.add('is-active')
    }
    entry.addEventListener('click', () => onJump(index))
    list.appendChild(entry)
  })

  if (!isMobile) return list

  const disclosure = document.createElement('details')
  disclosure.className = 'merqo-tour-steps__disclosure'
  const summary = document.createElement('summary')
  summary.textContent = 'Jump to a step'
  disclosure.appendChild(summary)
  disclosure.appendChild(list)
  return disclosure
}
