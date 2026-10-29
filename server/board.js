// The evidence board: the team drags the 12 notes into order and the host locks it in.
// Note ids are the true order, so card id n belongs at position n - 1.

export function newBoard(settings) {
  let order;
  do {
    order = Array.from({ length: 12 }, (_, i) => i + 1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  } while (countCorrect(order) > 2);
  return { order, holders: {}, attemptsLeft: settings.lockinAttempts, last: null, proposedBy: null };
}

export function countCorrect(order) {
  return order.filter((id, i) => id === i + 1).length;
}

export function moveCard(board, id, to) {
  const from = board.order.indexOf(id);
  if (from < 0 || !Number.isInteger(to) || to < 0 || to > 11 || from === to) return false;
  board.order.splice(from, 1);
  board.order.splice(to, 0, id);
  board.proposedBy = null;
  return true;
}

/**
 * Lock in the current order. Returns { final, kind, correct }. A correct order goes
 * straight to the true ending; otherwise the team gets feedback while attempts remain.
 */
export function lockIn(board, settings, force = false) {
  const correct = countCorrect(board.order);
  const need = settings.trueEnding === 'forgiving' ? 11 : 12;
  board.attemptsLeft = Math.max(0, board.attemptsLeft - 1);
  board.proposedBy = null;
  if (correct >= need) return { final: true, kind: 'author', correct };
  if (board.attemptsLeft > 0 && !force) {
    board.last = {
      correct,
      // For each misplaced card: does it belong earlier or later than where it sits?
      arrows: Object.fromEntries(board.order.map((id, i) => [id, id === i + 1 ? null : id - 1 < i ? 'earlier' : 'later'])),
    };
    return { final: false, correct };
  }
  return { final: true, kind: correct >= 6 ? 'unfinished' : 'runaway', correct };
}
